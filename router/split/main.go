package split

import (
	"app/config"
	"app/entities"
	"app/middleware"
	"app/router/uploadutil"
	"app/services/SplitService"
	"app/structs"
	"app/templates"
	"app/worker/channels"
	"net/http"
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
		Title:                "Chia Video Online — Cắt Video MP4 Theo Dung Lượng, Thời Gian",
		Description:          "Chia video online, cắt video MP4 miễn phí theo dung lượng (MB/GB) hoặc thời gian. Split video online / video cutter — hỗ trợ MKV, MOV, 4K–720P, tải ZIP ngay.",
		DescriptionEN:        "Split video online free — cut MP4 by file size (MB/GB) or duration. Video cutter for MKV, MOV; choose 4K, 1080P, 720P or original quality. Download ZIP in one click.",
		ActivePage:           "split",
		Result:               "",
		UserID:               userID,
		Breadcrumbs:          structs.ToolBreadcrumbs("Chia Video Online", "/video/split"),
		UploadChunkSizeBytes: config.UploadChunkSizeBytes,
	}
	data.Finalize()

	if r.Method == "POST" {
		reader, err := r.MultipartReader()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		resolved, err := uploadutil.ResolveMultipart(reader)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if len(resolved.Files) == 0 {
			return
		}

		extrasDto, err := structs.ParseSplitForm(resolved.FormFields)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		extrasJSON, err := extrasDto.ToJSON()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		for _, uploaded := range resolved.Files {
			job, err := SplitService.CreateJob(uploaded.Path, uploaded.Name, extrasJSON, userID)
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
