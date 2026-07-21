package trimaudio

import (
	"app/config"
	"app/entities"
	"app/middleware"
	"app/router/uploadutil"
	"app/services/TrimAudioService"
	"app/structs"
	"app/templates"
	"app/worker/channels"
	"net/http"
)

func Bootstrap() {
	http.HandleFunc("/video/trim-audio", handleTrimAudio)
	http.HandleFunc("/trim-audio", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/video/trim-audio", http.StatusMovedPermanently)
	})
}

func handleTrimAudio(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	data := structs.PageData{
		Title:                "Cắt Audio Online — Trim Audio với Fade In/Out",
		Description:          "Cắt file audio theo khoảng thời gian (start/end), thêm fade in/out. Hỗ trợ MP3, M4A, WAV, FLAC, OGG. Nghe thử trước khi xử lý.",
		DescriptionEN:        "Trim audio files by start/end timestamps with optional fade in/out. Supports MP3, M4A, WAV, FLAC, OGG. Preview before submit.",
		ActivePage:           "trim-audio",
		Result:               "",
		UserID:               userID,
		Breadcrumbs:          structs.ToolBreadcrumbs("Cắt Audio", "/video/trim-audio"),
		UploadChunkSizeBytes: config.UploadChunkSizeBytes,
	}
	data.Finalize()

	if r.Method == "POST" {
		handleTrimAudioPost(w, r, userID)
		return
	}

	if err := templates.Render(w, r, "templates/pages/trim-audio.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleTrimAudioPost(w http.ResponseWriter, r *http.Request, userID string) {
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
		http.Error(w, "Cần chọn một file audio", http.StatusBadRequest)
		return
	}
	if len(resolved.Files) > 1 {
		http.Error(w, "Chỉ được chọn một file audio", http.StatusBadRequest)
		return
	}

	extrasDto, err := structs.ParseTrimAudioForm(resolved.FormFields)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	extrasJSON, err := extrasDto.ToJSON()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	uploaded := resolved.Files[0]
	job, err := TrimAudioService.CreateJob(uploaded.Path, uploaded.Name, extrasJSON, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	channels.JobChannel <- entities.Job{ID: job.ID}

	http.Redirect(w, r, "/video/trim-audio", http.StatusSeeOther)
}
