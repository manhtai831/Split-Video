package gif

import (
	"app/entities"
	"app/middleware"
	"app/services/GifService"
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
	http.HandleFunc("/video/gif", middleware.WithUserID(handleGif))
	http.HandleFunc("/gif", middleware.WithUserID(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/video/gif", http.StatusMovedPermanently)
	}))
}

func handleGif(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	data := structs.PageData{
		Title:         "Tạo GIF từ Video — GIF, WebP, APNG",
		Description:   "Chuyển đoạn video thành GIF, WebP động hoặc APNG. Chọn thời gian, kích thước, chất lượng và FPS. Hỗ trợ nhiều đoạn từ một video.",
		DescriptionEN: "Convert video clips to GIF, animated WebP or APNG. Pick time range, size, quality and FPS. Multiple segments from one video.",
		ActivePage:    "gif",
		Result:        "",
		UserID:        userID,
	}

	if r.Method == "POST" {
		handleGifPost(w, r, userID)
		return
	}

	if err := templates.Render(w, "templates/pages/gif.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleGifPost(w http.ResponseWriter, r *http.Request, userID string) {
	reader, err := r.MultipartReader()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var uploadedPath, uploadedName string
	formFields := make(map[string]string)

	for part, err := reader.NextPart(); err != io.EOF; part, err = reader.NextPart() {
		if part.FileName() != "" {
			if uploadedPath != "" {
				http.Error(w, "Chỉ hỗ trợ một video mỗi lần", http.StatusBadRequest)
				return
			}
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

			uploadedPath = dst.Name()
			uploadedName = rawFileName
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

	if uploadedPath == "" {
		http.Error(w, "Cần chọn một file video", http.StatusBadRequest)
		return
	}

	extrasDto, err := structs.ParseGifForm(formFields)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	extrasJSON, err := extrasDto.ToJSON()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	job, err := GifService.CreateJob(uploadedPath, uploadedName, extrasJSON, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	channels.JobChannel <- entities.Job{ID: job.ID}
	http.Redirect(w, r, "/video/gif", http.StatusSeeOther)
}
