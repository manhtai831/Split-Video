package mergeaudio

import (
	"app/config"
	"app/entities"
	"app/middleware"
	"app/router/uploadutil"
	"app/services/MergeAudioService"
	"app/structs"
	"app/templates"
	"app/worker/channels"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

const maxMergeAudioClips = structs.MaxMergeClips

func Bootstrap() {
	http.HandleFunc("/video/merge-audio", handleMergeAudio)
	http.HandleFunc("/merge-audio", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/video/merge-audio", http.StatusMovedPermanently)
	})
}

func handleMergeAudio(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	data := structs.PageData{
		Title:                "Ghép Audio Online — Nối Nhiều File Audio Thành Một",
		Description:          "Ghép audio online miễn phí: nối nhiều file MP3, M4A, WAV, FLAC, OGG. Kéo thả thứ tự, chọn định dạng xuất, nghe thử trước khi xử lý.",
		DescriptionEN:        "Merge audio online free — combine multiple MP3, M4A, WAV, FLAC, OGG files. Reorder by drag-and-drop, pick output format, preview before submit.",
		ActivePage:           "merge-audio",
		Result:               "",
		UserID:               userID,
		Breadcrumbs:          structs.ToolBreadcrumbs("Ghép Audio", "/video/merge-audio"),
		UploadChunkSizeBytes: config.UploadChunkSizeBytes,
	}
	data.Finalize()

	if r.Method == "POST" {
		handleMergeAudioPost(w, r, userID)
		return
	}

	if err := templates.Render(w, r, "templates/pages/merge-audio.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleMergeAudioPost(w http.ResponseWriter, r *http.Request, userID string) {
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

	uploadedFiles := resolved.Files
	if len(uploadedFiles) < 2 {
		http.Error(w, "Cần ít nhất 2 file audio để ghép", http.StatusBadRequest)
		return
	}
	if len(uploadedFiles) > maxMergeAudioClips {
		http.Error(w, fmt.Sprintf("Tối đa %d file audio mỗi lần ghép", maxMergeAudioClips), http.StatusBadRequest)
		return
	}

	extrasDto, err := structs.ParseMergeAudioForm(resolved.FormFields)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	extrasJSON, err := extrasDto.ToJSON()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ordered := orderUploadedFiles(uploadedFiles, resolved.FormFields["file_order"])
	inputs := make([]MergeAudioService.InputFile, len(ordered))
	for i, uploaded := range ordered {
		inputs[i] = MergeAudioService.InputFile{
			Path:      uploaded.Path,
			Name:      uploaded.Name,
			SortOrder: i,
		}
	}

	job, err := MergeAudioService.CreateJob(inputs, extrasJSON, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	channels.JobChannel <- entities.Job{ID: job.ID}
	http.Redirect(w, r, "/video/merge-audio", http.StatusSeeOther)
}

func orderUploadedFiles(files []uploadutil.UploadedFile, orderRaw string) []uploadutil.UploadedFile {
	if orderRaw == "" {
		return files
	}

	parts := strings.Split(orderRaw, ",")
	ordered := make([]uploadutil.UploadedFile, 0, len(parts))
	seen := make(map[int]bool)

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		idx, err := strconv.Atoi(part)
		if err != nil || idx < 0 || idx >= len(files) || seen[idx] {
			continue
		}
		seen[idx] = true
		ordered = append(ordered, files[idx])
	}

	for i, f := range files {
		if !seen[i] {
			ordered = append(ordered, f)
		}
	}

	if len(ordered) == 0 {
		return files
	}
	return ordered
}
