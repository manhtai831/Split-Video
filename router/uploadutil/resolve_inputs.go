package uploadutil

import (
	"app/structs"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var (
	ErrNoFiles           = errors.New("no uploaded files")
	ErrInvalidPreupload  = errors.New("invalid preuploaded file path")
	ErrPreuploadNotFound = errors.New("preuploaded file not found")
)

type UploadedFile struct {
	Path string
	Name string
}

type ResolveResult struct {
	Files      []UploadedFile
	FormFields map[string]string
}

func ResolveMultipart(reader *multipart.Reader) (*ResolveResult, error) {
	var uploadedFiles []UploadedFile
	formFields := make(map[string]string)

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		if part.FileName() != "" {
			rawFileName := part.FileName()
			fileNameHash := md5.Sum([]byte(rawFileName))
			fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + path.Ext(rawFileName)

			dst, err := os.Create(path.Join("uploads", fileName))
			if err != nil {
				part.Close()
				return nil, err
			}

			_, err = io.Copy(dst, part)
			dst.Close()
			part.Close()
			if err != nil {
				return nil, err
			}

			uploadedFiles = append(uploadedFiles, UploadedFile{
				Path: dst.Name(),
				Name: rawFileName,
			})
			continue
		}

		name := part.FormName()
		if name == "" {
			part.Close()
			continue
		}
		body, err := io.ReadAll(part)
		part.Close()
		if err != nil {
			return nil, err
		}
		formFields[name] = string(body)
	}

	if preuploaded := strings.TrimSpace(formFields["preuploaded_files"]); preuploaded != "" {
		files, err := parsePreuploadedFiles(preuploaded)
		if err != nil {
			return nil, err
		}
		return &ResolveResult{Files: files, FormFields: formFields}, nil
	}

	if len(uploadedFiles) == 0 {
		return nil, ErrNoFiles
	}

	return &ResolveResult{Files: uploadedFiles, FormFields: formFields}, nil
}

func parsePreuploadedFiles(raw string) ([]UploadedFile, error) {
	var items []structs.PreuploadedFileDto
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidPreupload, err)
	}
	if len(items) == 0 {
		return nil, ErrNoFiles
	}

	files := make([]UploadedFile, 0, len(items))
	for _, item := range items {
		if err := validatePreuploadedPath(item.Path); err != nil {
			return nil, err
		}
		info, err := os.Stat(item.Path)
		if err != nil || info.IsDir() {
			return nil, fmt.Errorf("%w: %s", ErrPreuploadNotFound, item.Path)
		}
		name := item.Name
		if strings.TrimSpace(name) == "" {
			name = filepath.Base(item.Path)
		}
		files = append(files, UploadedFile{Path: filepath.ToSlash(item.Path), Name: name})
	}
	return files, nil
}

func validatePreuploadedPath(p string) error {
	clean := filepath.ToSlash(filepath.Clean(p))
	if !strings.HasPrefix(clean, "uploads/") {
		return fmt.Errorf("%w: %s", ErrInvalidPreupload, p)
	}
	if strings.Contains(clean, "..") {
		return fmt.Errorf("%w: %s", ErrInvalidPreupload, p)
	}
	if strings.HasPrefix(clean, "uploads/tmp/chunks/") {
		return fmt.Errorf("%w: chunk path not allowed", ErrInvalidPreupload)
	}
	return nil
}
