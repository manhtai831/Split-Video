package upload

import (
	"app/config"
	"app/middleware"
	"app/services/ChunkUploadService"
	"app/structs"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
)

func Bootstrap() {
	http.HandleFunc("/api/upload/prepare", handlePrepare)
	http.HandleFunc("/api/upload/part", handlePart)
	http.HandleFunc("/api/upload/complete", handleComplete)
}

func handlePrepare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserID(w, r)
	var req structs.UploadPrepareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	resp, err := ChunkUploadService.Prepare(userID, req)
	if err != nil {
		writeUploadError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handlePart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserID(w, r)
	maxBody := int64(config.UploadChunkSizeBytes) + 1024*1024
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)

	if err := r.ParseMultipartForm(maxBody); err != nil {
		http.Error(w, "Invalid multipart form", http.StatusBadRequest)
		return
	}

	folder := strings.TrimSpace(r.FormValue("folder"))
	partRaw := strings.TrimSpace(r.FormValue("part_index"))
	partIndex, err := strconv.Atoi(partRaw)
	if err != nil || folder == "" {
		http.Error(w, "folder and part_index are required", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()
	_ = header

	if err := ChunkUploadService.SavePart(userID, folder, partIndex, file); err != nil {
		writeUploadError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, structs.UploadPartResponse{OK: true})
}

func handleComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserID(w, r)
	var req structs.UploadCompleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	files, err := ChunkUploadService.Complete(userID, req)
	if err != nil {
		writeUploadError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, structs.UploadCompleteResponse{Files: files})
}

func writeUploadError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ChunkUploadService.ErrInvalidFolder),
		errors.Is(err, ChunkUploadService.ErrUnauthorized),
		errors.Is(err, ChunkUploadService.ErrInvalidPart),
		errors.Is(err, ChunkUploadService.ErrMissingParts),
		errors.Is(err, ChunkUploadService.ErrTooManyParts),
		errors.Is(err, ChunkUploadService.ErrInvalidFileMeta):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

// ReadFormFields reads non-file parts from a multipart reader into a map.
func ReadFormFields(reader *multipart.Reader) (map[string]string, error) {
	fields := make(map[string]string)
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if part.FileName() != "" {
			_ = part.Close()
			continue
		}
		name := part.FormName()
		if name == "" {
			_ = part.Close()
			continue
		}
		body, err := io.ReadAll(part)
		_ = part.Close()
		if err != nil {
			return nil, err
		}
		fields[name] = string(body)
	}
	return fields, nil
}
