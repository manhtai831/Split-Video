package jobs

import (
	"app/middleware"
	"app/services/JobFileDataService"
	"app/services/JobPresenterService"
	"app/services/JobService"
	"app/structs"
	"encoding/json"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"app/enums"
)

func Bootstrap() {
	http.HandleFunc("/api/jobs/stats", middleware.WithUserID(handleStats))
	http.HandleFunc("/api/jobs/", middleware.WithUserID(handleJobsWithPath))
	http.HandleFunc("/api/jobs", middleware.WithUserID(handleListJobs))
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

	writeJSON(w, structs.JobStatsResponseDto{
		Processing:       stats.Processing,
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
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// /api/jobs/{identifier}/files/{fileId}/download
	path := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	parts := strings.Split(path, "/")
	if len(parts) == 4 && parts[1] == "files" && parts[3] == "download" {
		handleDownload(w, r, parts[0], parts[2])
		return
	}

	http.NotFound(w, r)
}

func handleDownload(w http.ResponseWriter, r *http.Request, identifier, fileIDRaw string) {
	userID := middleware.GetUserID(w, r)

	job, err := JobService.GetJobByIdentifierForUser(identifier, userID)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	fileID, err := strconv.Atoi(fileIDRaw)
	if err != nil {
		http.Error(w, "Invalid file id", http.StatusBadRequest)
		return
	}

	fileData, err := JobFileDataService.GetJobFileDataById(fileID)
	if err != nil || fileData.JobID != job.ID || fileData.Type != enums.JobFileDataTypeOutput {
		http.NotFound(w, r)
		return
	}

	if _, err := os.Stat(fileData.Path); os.IsNotExist(err) {
		http.NotFound(w, r)
		return
	}

	_ = JobService.MarkJobDownloaded(job.ID)

	w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(fileData.Name)+"\"")
	http.ServeFile(w, r, fileData.Path)
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
