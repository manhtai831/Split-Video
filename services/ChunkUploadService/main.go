package ChunkUploadService

import (
	"app/config"
	"app/structs"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	chunksRoot      = "uploads/tmp/chunks"
	manifestName    = "manifest.json"
	partNamePattern = "file.part."
)

var (
	ErrInvalidFolder   = errors.New("invalid chunk folder")
	ErrUnauthorized    = errors.New("unauthorized chunk folder")
	ErrInvalidPart     = errors.New("invalid part index")
	ErrMissingParts    = errors.New("missing upload parts")
	ErrTooManyParts    = errors.New("too many parts")
	ErrInvalidFileMeta = errors.New("invalid file metadata")
)

type manifestSlot struct {
	Index      int    `json:"index"`
	Folder     string `json:"folder"`
	FileName   string `json:"file_name,omitempty"`
	TotalParts int    `json:"total_parts,omitempty"`
	Completed  bool   `json:"completed,omitempty"`
}

type manifest struct {
	UserID    string         `json:"user_id"`
	CreatedAt time.Time      `json:"created_at"`
	Slots     []manifestSlot `json:"slots"`
}

func Prepare(userID string, req structs.UploadPrepareRequest) (*structs.UploadPrepareResponse, error) {
	if req.FileCount < 1 {
		return nil, fmt.Errorf("%w: file_count must be at least 1", ErrInvalidFileMeta)
	}
	if req.FileCount > 200 {
		return nil, fmt.Errorf("%w: file_count exceeds limit", ErrInvalidFileMeta)
	}
	if len(req.Files) > 0 && len(req.Files) != req.FileCount {
		return nil, fmt.Errorf("%w: files length mismatch", ErrInvalidFileMeta)
	}

	sessionID := uuid.New().String()
	sessionDir := filepath.Join(chunksRoot, sessionID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		return nil, err
	}

	m := manifest{
		UserID:    userID,
		CreatedAt: time.Now().UTC(),
		Slots:     make([]manifestSlot, 0, req.FileCount),
	}
	resp := &structs.UploadPrepareResponse{
		SessionID: sessionID,
		Slots:     make([]structs.UploadSlotDto, 0, req.FileCount),
	}

	for i := 0; i < req.FileCount; i++ {
		folder := filepath.ToSlash(filepath.Join(chunksRoot, sessionID, strconv.Itoa(i)))
		if err := os.MkdirAll(folder, 0o755); err != nil {
			_ = os.RemoveAll(sessionDir)
			return nil, err
		}

		slot := manifestSlot{
			Index:  i,
			Folder: folder,
		}
		if i < len(req.Files) {
			meta := req.Files[i]
			if meta.TotalParts < 1 || meta.TotalParts > config.MaxUploadParts {
				_ = os.RemoveAll(sessionDir)
				return nil, ErrTooManyParts
			}
			slot.FileName = meta.Name
			slot.TotalParts = meta.TotalParts
		}
		m.Slots = append(m.Slots, slot)
		resp.Slots = append(resp.Slots, structs.UploadSlotDto{
			Index:  i,
			Folder: folder,
		})
	}

	if err := writeManifest(sessionDir, m); err != nil {
		_ = os.RemoveAll(sessionDir)
		return nil, err
	}

	return resp, nil
}

func SavePart(userID, folder string, partIndex int, reader io.Reader) error {
	if partIndex < 1 || partIndex > config.MaxUploadParts {
		return ErrInvalidPart
	}

	sessionDir, slot, m, err := loadManifestForFolder(userID, folder)
	if err != nil {
		return err
	}

	if slot.TotalParts > 0 && partIndex > slot.TotalParts {
		return ErrInvalidPart
	}

	partPath := filepath.Join(folder, partNamePattern+strconv.Itoa(partIndex))
	tmpPath := partPath + ".tmp"
	dst, err := os.Create(tmpPath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, reader); err != nil {
		dst.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, partPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}

	_ = sessionDir
	_ = m
	return nil
}

func Complete(userID string, req structs.UploadCompleteRequest) ([]structs.UploadCompletedFileDto, error) {
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("%w: no items", ErrInvalidFileMeta)
	}

	results := make([]structs.UploadCompletedFileDto, 0, len(req.Items))
	touchedSessions := make(map[string]bool)

	for i, item := range req.Items {
		if item.TotalParts < 1 || item.TotalParts > config.MaxUploadParts {
			return nil, ErrTooManyParts
		}
		if strings.TrimSpace(item.FileName) == "" {
			return nil, ErrInvalidFileMeta
		}

		sessionDir, slot, m, err := loadManifestForFolder(userID, item.Folder)
		if err != nil {
			return nil, err
		}
		if slot.Completed {
			return nil, fmt.Errorf("%w: folder already completed", ErrInvalidFolder)
		}

		if err := verifyParts(item.Folder, item.TotalParts); err != nil {
			return nil, err
		}

		outPath, size, err := mergeParts(item.Folder, item.FileName, item.TotalParts)
		if err != nil {
			return nil, err
		}

		_ = os.RemoveAll(item.Folder)
		for j := range m.Slots {
			if m.Slots[j].Folder == filepath.ToSlash(item.Folder) || m.Slots[j].Folder == item.Folder {
				m.Slots[j].Completed = true
				m.Slots[j].FileName = item.FileName
				m.Slots[j].TotalParts = item.TotalParts
				break
			}
		}
		touchedSessions[sessionDir] = true
		if err := writeManifest(sessionDir, *m); err != nil {
			return nil, err
		}

		results = append(results, structs.UploadCompletedFileDto{
			Index: i,
			Path:  outPath,
			Name:  item.FileName,
			Size:  size,
		})
	}

	for sessionDir := range touchedSessions {
		cleanupSessionIfDone(sessionDir)
	}

	return results, nil
}

func CleanupOrphanChunks() error {
	entries, err := os.ReadDir(chunksRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	cutoff := time.Now().Add(-time.Duration(config.UploadChunkTTLHours) * time.Hour)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		sessionDir := filepath.Join(chunksRoot, entry.Name())
		m, err := readManifest(sessionDir)
		if err != nil {
			_ = os.RemoveAll(sessionDir)
			continue
		}
		if m.CreatedAt.Before(cutoff) {
			_ = os.RemoveAll(sessionDir)
		}
	}
	return nil
}

func mergeParts(folder, fileName string, totalParts int) (string, int64, error) {
	fileNameHash := md5.Sum([]byte(fileName))
	outName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + path.Ext(fileName)
	outPath := filepath.Join("uploads", outName)

	if err := os.MkdirAll("uploads", 0o755); err != nil {
		return "", 0, err
	}

	dst, err := os.Create(outPath)
	if err != nil {
		return "", 0, err
	}
	defer dst.Close()

	for part := 1; part <= totalParts; part++ {
		partPath := filepath.Join(folder, partNamePattern+strconv.Itoa(part))
		src, err := os.Open(partPath)
		if err != nil {
			_ = os.Remove(outPath)
			return "", 0, fmt.Errorf("%w: part %d", ErrMissingParts, part)
		}
		if _, err := io.Copy(dst, src); err != nil {
			src.Close()
			_ = os.Remove(outPath)
			return "", 0, err
		}
		src.Close()
	}

	info, err := dst.Stat()
	if err != nil {
		return "", 0, err
	}

	return filepath.ToSlash(outPath), info.Size(), nil
}

func verifyParts(folder string, totalParts int) error {
	for part := 1; part <= totalParts; part++ {
		partPath := filepath.Join(folder, partNamePattern+strconv.Itoa(part))
		if _, err := os.Stat(partPath); err != nil {
			return fmt.Errorf("%w: part %d", ErrMissingParts, part)
		}
	}
	return nil
}

func loadManifestForFolder(userID, folder string) (string, *manifestSlot, *manifest, error) {
	folder = filepath.ToSlash(filepath.Clean(folder))
	if !strings.HasPrefix(folder, chunksRoot+"/") {
		return "", nil, nil, ErrInvalidFolder
	}

	rest := strings.TrimPrefix(folder, chunksRoot+"/")
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", nil, nil, ErrInvalidFolder
	}

	sessionDir := filepath.Join(chunksRoot, parts[0])
	m, err := readManifest(sessionDir)
	if err != nil {
		return "", nil, nil, err
	}
	if m.UserID != userID {
		return "", nil, nil, ErrUnauthorized
	}

	for i := range m.Slots {
		if m.Slots[i].Folder == folder {
			return sessionDir, &m.Slots[i], m, nil
		}
	}
	return "", nil, nil, ErrInvalidFolder
}

func readManifest(sessionDir string) (*manifest, error) {
	data, err := os.ReadFile(filepath.Join(sessionDir, manifestName))
	if err != nil {
		return nil, err
	}
	var m manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func writeManifest(sessionDir string, m manifest) error {
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(sessionDir, manifestName), data, 0o644)
}

func cleanupSessionIfDone(sessionDir string) {
	m, err := readManifest(sessionDir)
	if err != nil {
		_ = os.RemoveAll(sessionDir)
		return
	}
	for _, slot := range m.Slots {
		if !slot.Completed {
			return
		}
	}
	_ = os.RemoveAll(sessionDir)
}
