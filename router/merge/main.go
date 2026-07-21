package merge

import (
	"app/config"
	"app/entities"
	"app/middleware"
	"app/router/uploadutil"
	"app/services/MergeService"
	"app/structs"
	"app/templates"
	"app/worker/channels"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

const maxMergeClips = structs.MaxMergeClips

func Bootstrap() {
	http.HandleFunc("/video/merge", handleMerge)
	http.HandleFunc("/merge", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/video/merge", http.StatusMovedPermanently)
	})
}

func handleMerge(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	data := structs.PageData{
		Title:                "Ghép Video Online — Nối Nhiều Clip Thành Một File",
		Description:          "Ghép video online miễn phí: nối nhiều clip, ảnh thành một video. Merge video / join videos online — kéo thả thứ tự, chọn độ phân giải, xuất MP4, MKV, MOV.",
		DescriptionEN:        "Merge video online free — combine & join multiple clips or images into one file. Reorder by drag-and-drop, pick resolution, export MP4, MKV or MOV.",
		ActivePage:           "merge",
		Result:               "",
		UserID:               userID,
		Breadcrumbs:          structs.ToolBreadcrumbs("Ghép Video Online", "/video/merge"),
		UploadChunkSizeBytes: config.UploadChunkSizeBytes,
	}
	data.Finalize()

	if r.Method == "POST" {
		handleMergePost(w, r, userID)
		return
	}

	if err := templates.Render(w, r, "templates/pages/merge.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleMergePost(w http.ResponseWriter, r *http.Request, userID string) {
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
		http.Error(w, "Cần ít nhất 2 clip (video hoặc ảnh) để ghép", http.StatusBadRequest)
		return
	}
	if len(uploadedFiles) > maxMergeClips {
		http.Error(w, fmt.Sprintf("Tối đa %d clip/ảnh mỗi lần ghép", maxMergeClips), http.StatusBadRequest)
		return
	}

	itemsMeta, err := structs.ParseItemsMeta(resolved.FormFields["items_meta"], len(uploadedFiles))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	extrasDto, err := structs.ParseMergeForm(resolved.FormFields)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	extrasDto.ItemsMeta = itemsMeta
	extrasJSON, err := extrasDto.ToJSON()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ordered := orderUploadedFiles(uploadedFiles, resolved.FormFields["file_order"])
	inputs := make([]MergeService.InputFile, len(ordered))
	for i, uploaded := range ordered {
		kind := "video"
		var holdDuration float64
		if i < len(itemsMeta) {
			kind = itemsMeta[i].Kind
			holdDuration = itemsMeta[i].HoldDuration
		}
		inputs[i] = MergeService.InputFile{
			Path:         uploaded.Path,
			Name:         uploaded.Name,
			SortOrder:    i,
			Kind:         kind,
			HoldDuration: holdDuration,
		}
	}

	job, err := MergeService.CreateJob(inputs, extrasJSON, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	channels.JobChannel <- entities.Job{ID: job.ID}
	http.Redirect(w, r, "/video/merge", http.StatusSeeOther)
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
