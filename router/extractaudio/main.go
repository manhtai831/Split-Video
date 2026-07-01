package extractaudio

import (
	"app/entities"
	"app/middleware"
	"app/services/ExtractAudioService"
	"app/structs"
	"app/templates"
	"app/worker/channels"
	"crypto/md5"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path"
	"strconv"
	"time"
)

func Bootstrap() {
	http.HandleFunc("/video/extract-audio", handleExtractAudio)
	http.HandleFunc("/extract-audio", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/video/extract-audio", http.StatusMovedPermanently)
	})
}

func handleExtractAudio(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	data := structs.PageData{
		Title:         "Tách Âm Thanh Khỏi Video — MP3, M4A, WAV, FLAC, OGG",
		Description:   "Trích xuất audio từ video MP4, MOV, MKV. Chọn định dạng, bitrate, chỉnh âm lượng, tốc độ phát và metadata. Nhiều video — mỗi file một job.",
		DescriptionEN: "Extract audio from MP4, MOV, MKV videos. Choose format, bitrate, volume, playback speed and metadata. Multiple videos — one job per file.",
		ActivePage:    "extract-audio",
		Result:        "",
		UserID:        userID,
	}

	if r.Method == "POST" {
		handleExtractAudioPost(w, r, userID)
		return
	}

	if err := templates.Render(w, "templates/pages/extract-audio.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleExtractAudioPost(w http.ResponseWriter, r *http.Request, userID string) {
	reader, err := r.MultipartReader()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	type uploadedFile struct {
		path string
		name string
	}

	var uploadedFiles []uploadedFile
	formFields := make(map[string]string)
	for part, err := reader.NextPart(); err != io.EOF; part, err = reader.NextPart() {
		if part.FileName() != "" {
			rawFileName := part.FileName()
			fileNameHash := md5.Sum([]byte(rawFileName))
			fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + path.Ext(rawFileName)

			dst, err := os.Create(path.Join("uploads", fileName))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			_, err = io.Copy(dst, part)
			dst.Close()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			uploadedFiles = append(uploadedFiles, uploadedFile{
				path: dst.Name(),
				name: rawFileName,
			})
			continue
		}

		name := part.FormName()
		if name == "" {
			continue
		}
		body, err := io.ReadAll(part)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		formFields[name] = string(body)
	}
	if len(uploadedFiles) == 0 {
		http.Error(w, "Cần chọn ít nhất một file video", http.StatusBadRequest)
		return
	}

	extrasDto, err := structs.ParseExtractAudioForm(formFields)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	extrasJSON, err := extrasDto.ToJSON()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for _, uploaded := range uploadedFiles {
		job, err := ExtractAudioService.CreateJob(uploaded.path, uploaded.name, extrasJSON, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		channels.JobChannel <- entities.Job{ID: job.ID}
	}

	http.Redirect(w, r, "/video/extract-audio", http.StatusSeeOther)
}
