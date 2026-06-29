package structs

import "time"

type JobOutputFileDto struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	DownloadURL string `json:"download_url"`
}

type JobItemDto struct {
	Identifier    string             `json:"identifier"`
	Type          string             `json:"type"`
	Status        string             `json:"status"`
	Progress      float64            `json:"progress"`
	FileName      string             `json:"file_name"`
	FileSize      int64              `json:"file_size"`
	Duration      float64            `json:"duration"`
	EncodeSummary string             `json:"encode_summary"`
	Error         string             `json:"error"`
	CreatedAt     *time.Time         `json:"created_at"`
	StartedAt     *time.Time         `json:"started_at"`
	FinishedAt    *time.Time         `json:"finished_at"`
	DownloadAt    *time.Time         `json:"download_at"`
	OutputFiles   []JobOutputFileDto `json:"output_files"`
	DownloadURL   *string            `json:"download_url"`
}

type JobListResponseDto struct {
	Items      []JobItemDto `json:"items"`
	Total      int64        `json:"total"`
	Page       int          `json:"page"`
	Limit      int          `json:"limit"`
	TotalPages int          `json:"total_pages"`
}

type JobStatsResponseDto struct {
	Processing       int64 `json:"processing"`
	CompletedToday   int64 `json:"completed_today"`
	Failed           int64 `json:"failed"`
	Total            int64 `json:"total"`
	AvgEncodeSeconds int64 `json:"avg_encode_seconds"`
}
