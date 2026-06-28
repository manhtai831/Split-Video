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
	http.HandleFunc("/video/split", middleware.WithUserID(func(w http.ResponseWriter, r *http.Request) {
		data := structs.PageData{
			Title:      "Split Video",
			ActivePage: "split",
			Result:     "",
		}

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
				userID := middleware.GetUserID(w, r)
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
		}

		if err := templates.Render(w, "templates/pages/split.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
}
