package structs

import "time"

type AdminJobItemDto struct {
	JobItemDto
	UserID string `json:"user_id"`
}

type AdminJobListResponseDto struct {
	Items      []AdminJobItemDto `json:"items"`
	Total      int64             `json:"total"`
	Page       int               `json:"page"`
	Limit      int               `json:"limit"`
	TotalPages int               `json:"total_pages"`
}

type AdminJobStatsResponseDto struct {
	Pending             int64                   `json:"pending"`
	Processing          int64                   `json:"processing"`
	CompletedToday      int64                   `json:"completed_today"`
	Failed              int64                   `json:"failed"`
	Total               int64                   `json:"total"`
	AvgEncodeSeconds    int64                   `json:"avg_encode_seconds"`
	YoutubeProcessed7d  int64                   `json:"youtube_processed_7d"`
	YoutubeFailed7d     int64                   `json:"youtube_failed_7d"`
	Storage             StorageStatsResponseDto `json:"storage"`
}

type AdminYoutubeErrorItemDto struct {
	ID        int       `json:"id"`
	UserID    string    `json:"user_id"`
	URL       string    `json:"url"`
	Action    string    `json:"action"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

type AdminYoutubeErrorListResponseDto struct {
	Items      []AdminYoutubeErrorItemDto `json:"items"`
	Total      int64                      `json:"total"`
	Page       int                        `json:"page"`
	Limit      int                        `json:"limit"`
	TotalPages int                        `json:"total_pages"`
}

type StorageStatsResponseDto struct {
	TotalBytes     int64            `json:"total_bytes"`
	InputsBytes    int64            `json:"inputs_bytes"`
	OutputBytes    int64            `json:"output_bytes"`
	TmpBytes       int64            `json:"tmp_bytes"`
	OutputByType   map[string]int64 `json:"output_by_type"`
	FileCount      int              `json:"file_count"`
	DiskTotalBytes int64            `json:"disk_total_bytes"`
	DiskFreeBytes  int64            `json:"disk_free_bytes"`
	ScannedAt      time.Time        `json:"scanned_at"`
	ScanDurationMs int64            `json:"scan_duration_ms"`
}
