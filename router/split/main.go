package split

import (
	"app/entities"
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
	http.HandleFunc("/video/split", func(w http.ResponseWriter, r *http.Request) {
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
			filePath := ""
			rawFileName := ""
			formFields := make(map[string]string)
			for part, err := reader.NextPart(); err != io.EOF; part, err = reader.NextPart() {
				if part.FileName() != "" {
					rawFileName = part.FileName()
					fileNameHash := md5.Sum([]byte(rawFileName))
					fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixMilli(), 10) + path.Ext(part.FileName())

					dst, err := os.Create(path.Join("uploads", fileName))
					if err != nil {
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
					defer dst.Close()

					filePath = dst.Name()

					_, err = io.Copy(dst, part)
					if err != nil {
						http.Error(w, err.Error(), http.StatusInternalServerError)
						return
					}
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
			if filePath == "" {
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

			job, err := SplitService.CreateJob(filePath, rawFileName, extrasJSON)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			channels.JobChannel <- entities.Job{
				ID: job.ID,
			}
		}

		if err := templates.Render(w, "templates/pages/split.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})
}
