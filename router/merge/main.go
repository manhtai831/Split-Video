package merge

import (
	"app/entities"
	"app/middleware"
	"app/services/MergeService"
	"app/structs"
	"app/templates"
	"app/worker/channels"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
)

const maxMergeClips = structs.MaxMergeClips

type uploadedFile struct {
	path string
	name string
}

func Bootstrap() {
	http.HandleFunc("/video/merge", middleware.WithUserID(handleMerge))
	http.HandleFunc("/merge", middleware.WithUserID(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/video/merge", http.StatusMovedPermanently)
	}))
}

func handleMerge(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	data := structs.PageData{
		Title:         "Ghép Video Online — Nối Nhiều Clip Thành Một",
		Description:   "Ghép nhiều video thành một file duy nhất. Sắp xếp thứ tự clip, chọn độ phân giải đích và định dạng đầu ra. Hỗ trợ MP4, MKV, MOV.",
		DescriptionEN: "Merge multiple videos into one file. Reorder clips, choose output resolution and format. Supports MP4, MKV, MOV.",
		ActivePage:    "merge",
		Result:        "",
		UserID:        userID,
	}

	if r.Method == "POST" {
		handleMergePost(w, r, userID)
		return
	}

	if err := templates.Render(w, "templates/pages/merge.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleMergePost(w http.ResponseWriter, r *http.Request, userID string) {
	reader, err := r.MultipartReader()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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

	if len(uploadedFiles) < 2 {
		http.Error(w, "Cần ít nhất 2 clip (video hoặc ảnh) để ghép", http.StatusBadRequest)
		return
	}
	if len(uploadedFiles) > maxMergeClips {
		http.Error(w, fmt.Sprintf("Tối đa %d clip/ảnh mỗi lần ghép", maxMergeClips), http.StatusBadRequest)
		return
	}

	itemsMeta, err := structs.ParseItemsMeta(formFields["items_meta"], len(uploadedFiles))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	extrasDto, err := structs.ParseMergeForm(formFields)
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

	ordered := orderUploadedFiles(uploadedFiles, formFields["file_order"])
	inputs := make([]MergeService.InputFile, len(ordered))
	for i, uploaded := range ordered {
		kind := "video"
		var holdDuration float64
		if i < len(itemsMeta) {
			kind = itemsMeta[i].Kind
			holdDuration = itemsMeta[i].HoldDuration
		}
		inputs[i] = MergeService.InputFile{
			Path:         uploaded.path,
			Name:         uploaded.name,
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

func orderUploadedFiles(files []uploadedFile, orderRaw string) []uploadedFile {
	if orderRaw == "" {
		return files
	}

	parts := strings.Split(orderRaw, ",")
	ordered := make([]uploadedFile, 0, len(parts))
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
