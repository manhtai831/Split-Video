package extractaudio

import (
	"app/config"
	"app/entities"
	"app/middleware"
	"app/router/uploadutil"
	"app/services/ExtractAudioService"
	"app/structs"
	"app/templates"
	"app/worker/channels"
	"net/http"
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
		Title:                "Tách Âm Thanh từ Video — Video to MP3, M4A, WAV Online",
		Description:          "Tách âm thanh khỏi video online miễn phí. Chuyển video thành MP3 / extract audio from video — hỗ trợ M4A, WAV, FLAC, OGG. Chọn bitrate, âm lượng, tốc độ phát.",
		DescriptionEN:        "Extract audio from video online free — convert video to MP3, M4A, WAV, FLAC or OGG. Adjust bitrate, volume, speed and metadata. One job per file.",
		ActivePage:           "extract-audio",
		Result:               "",
		UserID:               userID,
		Breadcrumbs:          structs.ToolBreadcrumbs("Tách Âm Thanh", "/video/extract-audio"),
		UploadChunkSizeBytes: config.UploadChunkSizeBytes,
	}
	data.Finalize()

	if r.Method == "POST" {
		handleExtractAudioPost(w, r, userID)
		return
	}

	if err := templates.Render(w, r, "templates/pages/extract-audio.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleExtractAudioPost(w http.ResponseWriter, r *http.Request, userID string) {
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
		http.Error(w, "Cần chọn ít nhất một file video", http.StatusBadRequest)
		return
	}

	extrasDto, err := structs.ParseExtractAudioForm(resolved.FormFields)
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
		job, err := ExtractAudioService.CreateJob(uploaded.Path, uploaded.Name, extrasJSON, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		channels.JobChannel <- entities.Job{ID: job.ID}
	}

	http.Redirect(w, r, "/video/extract-audio", http.StatusSeeOther)
}
