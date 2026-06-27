package split

import (
	"app/entities"
	"app/services/SplitService"
	"app/structs"
	"app/worker/channels"
	"crypto/md5"
	"encoding/hex"
	"html/template"
	"io"
	"net/http"
	"os"
	"path"
	"strconv"
	"time"
)

func Bootstrap() {
	http.HandleFunc("/video/split", func(w http.ResponseWriter, r *http.Request) {

		data := structs.ChunkVideoDto{
			Result: "",
		}

		if r.Method == "POST" {
			reader, err := r.MultipartReader()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			filePath := ""
			rawFileName := ""
			for part, err := reader.NextPart(); err != io.EOF; part, err = reader.NextPart() {
				if part.FileName() == "" {
					continue
				}
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
			}
			if filePath == "" {
				return
			}

			job, err := SplitService.CreateJob(filePath, rawFileName)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			channels.JobChannel <- entities.Job{
				ID: job.ID,
			}
		}

		tmpl, err := template.ParseFiles("templates/index.html")

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		err = tmpl.Execute(w, data)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	})
}
