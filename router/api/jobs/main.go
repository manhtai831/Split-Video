package jobs

import (
	"app/entities"
	"app/enums"
	"app/middleware"
	"app/services/JobFileDataService"
	"app/services/JobPresenterService"
	"app/services/JobService"
	"app/structs"
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func Bootstrap() {
	http.HandleFunc("/api/jobs/stats", handleStats)
	http.HandleFunc("/api/jobs/", handleJobsWithPath)
	http.HandleFunc("/api/jobs", handleListJobs)
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserID(w, r)
	stats, err := JobService.GetStatsByUser(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Home dashboard "Đang xử lý" still means pending + processing.
	writeJSON(w, structs.JobStatsResponseDto{
		Processing:       stats.Pending + stats.Processing,
		CompletedToday:   stats.CompletedToday,
		Failed:           stats.Failed,
		Total:            stats.Total,
		AvgEncodeSeconds: stats.AvgEncodeSeconds,
	})
}

func handleListJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserID(w, r)
	opts := parseListOptions(r)

	jobs, total, err := JobService.ListJobsByUser(userID, opts)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	items, err := JobPresenterService.ToJobItemDtos(jobs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	totalPages := int(math.Max(1, math.Ceil(float64(total)/float64(opts.Limit))))
	writeJSON(w, structs.JobListResponseDto{
		Items:      items,
		Total:      total,
		Page:       opts.Page,
		Limit:      opts.Limit,
		TotalPages: totalPages,
	})
}

func handleJobsWithPath(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	parts := strings.Split(path, "/")

	if len(parts) == 2 && parts[1] == "download-zip" && r.Method == http.MethodPost {
		handleDownloadZip(w, r, parts[0])
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// /api/jobs/{identifier}/files/{fileId}/download
	if len(parts) == 4 && parts[1] == "files" && parts[3] == "download" {
		handleDownload(w, r, parts[0], parts[2])
		return
	}

	http.NotFound(w, r)
}

func handleDownload(w http.ResponseWriter, r *http.Request, identifier, fileIDRaw string) {
	userID := middleware.GetUserID(w, r)

	fileID, err := strconv.Atoi(fileIDRaw)
	if err != nil {
		http.Error(w, "Invalid file id", http.StatusBadRequest)
		return
	}

	fileData, err := JobFileDataService.GetFileByIdentifierAndUser(identifier, userID, fileID)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	if _, err := os.Stat(fileData.Path); os.IsNotExist(err) {
		http.NotFound(w, r)
		return
	}

	if fileData.Type == enums.JobFileDataTypeOutput {
		_ = JobService.MarkJobDownloaded(fileData.JobID)
	}

	disposition := "attachment"
	if fileData.Type == enums.JobFileDataTypeInput {
		job, jobErr := JobService.GetJobByIdentifierForUser(identifier, userID)
		if jobErr == nil && job.Type == enums.JobTypeEditor {
			disposition = "inline"
		}
	}

	w.Header().Set("Content-Disposition", disposition+"; filename=\""+filepath.Base(fileData.Name)+"\"")
	http.ServeFile(w, r, fileData.Path)
}

func handleDownloadZip(w http.ResponseWriter, r *http.Request, identifier string) {
	userID := middleware.GetUserID(w, r)

	var req structs.DownloadZipRequestDto
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.FileIDs) == 0 {
		http.Error(w, "No files selected", http.StatusBadRequest)
		return
	}

	files, err := JobFileDataService.GetOutputFilesByIdentifierAndUser(identifier, userID, req.FileIDs)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	for _, fileData := range files {
		if _, err := os.Stat(fileData.Path); os.IsNotExist(err) {
			http.NotFound(w, r)
			return
		}
	}

	zipName, err := buildZipDownloadName(files[0].JobID, identifier)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+zipName+"\"")

	zw := zip.NewWriter(w)
	defer zw.Close()

	seen := make(map[string]int)
	for _, fileData := range files {
		if err := addFileToZip(zw, fileData, seen); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	_ = JobService.MarkJobDownloaded(files[0].JobID)
}

func buildZipDownloadName(jobID int, identifier string) (string, error) {
	baseName := identifier
	inputFiles, err := JobFileDataService.GetJobFileDataByJobId(jobID, enums.JobFileDataTypeInput)
	if err != nil {
		return "", err
	}
	if len(inputFiles) > 0 && inputFiles[0].Name != "" {
		baseName = strings.TrimSuffix(inputFiles[0].Name, filepath.Ext(inputFiles[0].Name))
	}
	return sanitizeDownloadFilename(baseName) + ".zip", nil
}

func sanitizeDownloadFilename(name string) string {
	name = filepath.Base(name)
	if name == "" || name == "." || name == ".." {
		return "download"
	}
	var b strings.Builder
	for _, r := range name {
		if r == '/' || r == '\\' || r == 0 {
			continue
		}
		b.WriteRune(r)
	}
	if result := strings.TrimSpace(b.String()); result != "" {
		return result
	}
	return "download"
}

func uniqueZipEntryName(name string, seen map[string]int) string {
	base := filepath.Base(name)
	if base == "" || base == "." || base == ".." {
		base = "file"
	}
	if seen[base] == 0 {
		seen[base] = 1
		return base
	}
	seen[base]++
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	return fmt.Sprintf("%s_%d%s", stem, seen[base], ext)
}

func addFileToZip(zw *zip.Writer, fileData entities.JobFileData, seen map[string]int) error {
	f, err := os.Open(fileData.Path)
	if err != nil {
		return err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = uniqueZipEntryName(fileData.Name, seen)
	header.Method = zip.Deflate

	wr, err := zw.CreateHeader(header)
	if err != nil {
		return err
	}

	_, err = io.Copy(wr, f)
	return err
}

func parseListOptions(r *http.Request) JobService.ListJobsOptions {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 5
	}

	opts := JobService.ListJobsOptions{
		Statuses:   JobService.ParseStatusFilter(q.Get("status")),
		ActiveOnly: q.Get("active_only") == "true",
		Page:       page,
		Limit:      limit,
	}

	if from := q.Get("from"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			opts.From = &t
		}
	}
	if to := q.Get("to"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			opts.To = &t
		}
	}

	if jobType := q.Get("type"); jobType != "" {
		t := enums.JobType(jobType)
		opts.Type = &t
	}

	return opts
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
