package admin

import (
	"app/enums"
	"app/middleware"
	"app/services/JobPresenterService"
	"app/services/JobService"
	"app/services/StorageService"
	"app/structs"
	"app/templates"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func Bootstrap() {
	handler := middleware.BasicAuth(http.HandlerFunc(routeAdmin))
	http.Handle("/admin", handler)
	http.Handle("/admin/", handler)
}

func routeAdmin(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimSuffix(r.URL.Path, "/")
	if path == "" {
		path = "/admin"
	}

	switch {
	case path == "/admin":
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleDashboard(w, r)
	case path == "/admin/api/jobs/stats":
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleStats(w, r)
	case path == "/admin/api/storage/refresh":
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleStorageRefresh(w, r)
	case path == "/admin/api/jobs":
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleListJobs(w, r)
	default:
		http.NotFound(w, r)
	}
}

func handleDashboard(w http.ResponseWriter, r *http.Request) {
	data := structs.PageData{
		Title:   "Admin Dashboard",
		NoIndex: true,
	}
	data.Finalize()

	if err := templates.RenderAdmin(w, "templates/pages/admin/dashboard.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := JobService.GetGlobalStats()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	storage := StorageService.GetStorageStats()
	writeJSON(w, structs.AdminJobStatsResponseDto{
		Processing:       stats.Processing,
		CompletedToday:   stats.CompletedToday,
		Failed:           stats.Failed,
		Total:            stats.Total,
		AvgEncodeSeconds: stats.AvgEncodeSeconds,
		Storage:          toStorageDto(storage),
	})
}

func handleStorageRefresh(w http.ResponseWriter, r *http.Request) {
	storage := StorageService.RefreshStorageStats()
	writeJSON(w, toStorageDto(storage))
}

func handleListJobs(w http.ResponseWriter, r *http.Request) {
	opts := parseListOptions(r)
	jobs, total, err := JobService.ListAllJobs(opts)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	items, err := JobPresenterService.ToAdminJobItemDtos(jobs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	totalPages := int(math.Max(1, math.Ceil(float64(total)/float64(opts.Limit))))
	writeJSON(w, structs.AdminJobListResponseDto{
		Items:      items,
		Total:      total,
		Page:       opts.Page,
		Limit:      opts.Limit,
		TotalPages: totalPages,
	})
}

func parseListOptions(r *http.Request) JobService.ListJobsOptions {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
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

func toStorageDto(s StorageService.StorageStats) structs.StorageStatsResponseDto {
	return structs.StorageStatsResponseDto{
		TotalBytes:     s.TotalBytes,
		InputsBytes:    s.InputsBytes,
		OutputBytes:    s.OutputBytes,
		TmpBytes:       s.TmpBytes,
		OutputByType:   s.OutputByType,
		FileCount:      s.FileCount,
		DiskTotalBytes: s.DiskTotalBytes,
		DiskFreeBytes:  s.DiskFreeBytes,
		ScannedAt:      s.ScannedAt,
		ScanDurationMs: s.ScanDurationMs,
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
