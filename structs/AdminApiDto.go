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
	Processing       int64                     `json:"processing"`
	CompletedToday   int64                     `json:"completed_today"`
	Failed           int64                     `json:"failed"`
	Total            int64                     `json:"total"`
	AvgEncodeSeconds int64                     `json:"avg_encode_seconds"`
	Storage          StorageStatsResponseDto   `json:"storage"`
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
