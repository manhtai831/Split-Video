package split

import (
	"app/entities"
	"app/middleware"
	"app/services/SplitService"
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
	http.HandleFunc("/split", handleLegacySplit)
	http.HandleFunc("/video/split", handleSplit)
}

func handleLegacySplit(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/video/split", http.StatusMovedPermanently)
}

func handleSplit(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	data := structs.PageData{
		Title:         "Chia Video Online — Cắt Theo Dung Lượng & Thời Gian",
		Description:   "Chia video lớn theo dung lượng (MB/GB) hoặc thời gian. Hỗ trợ MP4, MKV, MOV — 4K, 1080P, 720P hoặc giữ chất lượng gốc. Tải ZIP.",
		DescriptionEN: "Split large videos by file size (MB/GB) or duration (seconds, minutes, hours). Supports MP4, MKV, MOV — choose 4K, 1080P, 720P or keep original quality. One-click ZIP download.",
		ActivePage:    "split",
		Result:        "",
		UserID:        userID,
		Breadcrumbs:   structs.ToolBreadcrumbs("Chia Video Online", "/video/split"),
	}
	data.Finalize()

	if r.Method == "POST" {
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
			return
		}

		extrasDto, err := structs.ParseSplitForm(formFields)
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
			job, err := SplitService.CreateJob(uploaded.path, uploaded.name, extrasJSON, userID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			channels.JobChannel <- entities.Job{
				ID: job.ID,
			}
		}

		http.Redirect(w, r, "/video/split", http.StatusSeeOther)
		return
	}

	if err := templates.Render(w, "templates/pages/split.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
