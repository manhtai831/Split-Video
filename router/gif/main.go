package gif

import (
	"app/config"
	"app/entities"
	"app/middleware"
	"app/router/uploadutil"
	"app/services/GifService"
	"app/structs"
	"app/templates"
	"app/worker/channels"
	"net/http"
)

func Bootstrap() {
	http.HandleFunc("/video/gif", handleGif)
	http.HandleFunc("/gif", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/video/gif", http.StatusMovedPermanently)
	})
}

func handleGif(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	data := structs.PageData{
		Title:                "Tạo GIF từ Video — Video to GIF, WebP, APNG Online",
		Description:          "Tạo GIF từ video online miễn phí. Chuyển video thành GIF, WebP động hoặc APNG — video to GIF maker: chọn đoạn, kích thước, FPS, chất lượng. Nhiều clip từ một file.",
		DescriptionEN:        "Free video to GIF converter online — make GIF, animated WebP or APNG from video. Pick time range, size, FPS and quality. Multiple segments from one clip.",
		ActivePage:           "gif",
		Result:               "",
		UserID:               userID,
		Breadcrumbs:          structs.ToolBreadcrumbs("Tạo GIF từ Video", "/video/gif"),
		UploadChunkSizeBytes: config.UploadChunkSizeBytes,
	}
	data.Finalize()

	if r.Method == "POST" {
		handleGifPost(w, r, userID)
		return
	}

	if err := templates.Render(w, r, "templates/pages/gif.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleGifPost(w http.ResponseWriter, r *http.Request, userID string) {
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

	if len(resolved.Files) != 1 {
		http.Error(w, "Cần chọn một file video", http.StatusBadRequest)
		return
	}

	uploaded := resolved.Files[0]
	extrasDto, err := structs.ParseGifForm(resolved.FormFields)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	extrasJSON, err := extrasDto.ToJSON()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	job, err := GifService.CreateJob(uploaded.Path, uploaded.Name, extrasJSON, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	channels.JobChannel <- entities.Job{ID: job.ID}
	http.Redirect(w, r, "/video/gif", http.StatusSeeOther)
}
