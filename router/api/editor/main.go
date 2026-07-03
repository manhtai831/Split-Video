package editor

import (
	"app/entities"
	"app/middleware"
	"app/services/EditorService"
	"app/worker/channels"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
)

func Bootstrap() {
	http.HandleFunc("/api/editor/jobs/", handleEditorJobsWithPath)
	http.HandleFunc("/api/editor/jobs", handleEditorJobs)
}

func handleEditorJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserID(w, r)
	configJSON, files, err := parseEditorMultipart(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	job, err := EditorService.CreateDraft(userID, configJSON, files)
	if err != nil {
		writeEditorError(w, err)
		return
	}

	resp, err := EditorService.GetEditorJob(job.Identifier, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func handleEditorJobsWithPath(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/editor/jobs/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}

	identifier := parts[0]
	userID := middleware.GetUserID(w, r)

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			handleGetEditorJob(w, r, identifier, userID)
		case http.MethodPut:
			handleUpdateEditorJob(w, r, identifier, userID)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	if len(parts) == 2 {
		switch parts[1] {
		case "duplicate":
			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			handleDuplicateEditorJob(w, r, identifier, userID)
		case "publish":
			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			handlePublishEditorJob(w, r, identifier, userID)
		case "draft":
			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			handleRevertDraft(w, r, identifier, userID)
		default:
			http.NotFound(w, r)
		}
		return
	}

	http.NotFound(w, r)
}

func handleGetEditorJob(w http.ResponseWriter, r *http.Request, identifier, userID string) {
	resp, err := EditorService.GetEditorJob(identifier, userID)
	if err != nil {
		writeEditorError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleUpdateEditorJob(w http.ResponseWriter, r *http.Request, identifier, userID string) {
	configJSON, files, err := parseEditorMultipart(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_, err = EditorService.UpdateDraft(identifier, userID, configJSON, files)
	if err != nil {
		writeEditorError(w, err)
		return
	}

	resp, err := EditorService.GetEditorJob(identifier, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleDuplicateEditorJob(w http.ResponseWriter, r *http.Request, identifier, userID string) {
	job, err := EditorService.DuplicateJob(identifier, userID)
	if err != nil {
		writeEditorError(w, err)
		return
	}

	resp, err := EditorService.GetEditorJob(job.Identifier, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func handlePublishEditorJob(w http.ResponseWriter, r *http.Request, identifier, userID string) {
	job, err := EditorService.PublishJob(identifier, userID)
	if err != nil {
		writeEditorError(w, err)
		return
	}

	channels.JobChannel <- entities.Job{ID: job.ID}

	resp, err := EditorService.GetEditorJob(job.Identifier, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleRevertDraft(w http.ResponseWriter, r *http.Request, identifier, userID string) {
	if err := EditorService.RevertToDraft(identifier, userID); err != nil {
		writeEditorError(w, err)
		return
	}

	resp, err := EditorService.GetEditorJob(identifier, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func parseEditorMultipart(r *http.Request) (string, []EditorService.UploadedFile, error) {
	reader, err := r.MultipartReader()
	if err != nil {
		return "", nil, err
	}

	var configJSON string
	var files []EditorService.UploadedFile

	for part, err := reader.NextPart(); err != io.EOF; part, err = reader.NextPart() {
		if err != nil {
			return "", nil, err
		}

		name := part.FormName()
		if name == "" {
			continue
		}

		if name == "config" {
			body, err := io.ReadAll(part)
			if err != nil {
				return "", nil, err
			}
			configJSON = string(body)
			continue
		}

		if strings.HasPrefix(name, "file_") {
			clientKey := strings.TrimPrefix(name, "file_")
			if clientKey == "" {
				continue
			}

			rawFileName := part.FileName()
			if rawFileName == "" {
				rawFileName = clientKey
			}

			fileNameHash := md5.Sum([]byte(rawFileName + clientKey))
			fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + path.Ext(rawFileName)

			dst, err := os.Create(path.Join("uploads", fileName))
			if err != nil {
				return "", nil, err
			}

			_, err = io.Copy(dst, part)
			dst.Close()
			if err != nil {
				return "", nil, err
			}

			files = append(files, EditorService.UploadedFile{
				ClientKey: clientKey,
				Path:      dst.Name(),
				Name:      rawFileName,
			})
		}
	}

	if configJSON == "" {
		return "", nil, errors.New("missing config field")
	}

	return configJSON, files, nil
}

func writeEditorError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, EditorService.ErrJobNotFound):
		http.NotFound(w, nil)
	case errors.Is(err, EditorService.ErrInvalidStatus), errors.Is(err, EditorService.ErrNotEditorJob):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		msg := err.Error()
		if strings.Contains(msg, "invalid editor config") ||
			strings.Contains(msg, "frame width") ||
			strings.Contains(msg, "duration must") ||
			strings.Contains(msg, "editor config is empty") {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		http.Error(w, msg, http.StatusInternalServerError)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
