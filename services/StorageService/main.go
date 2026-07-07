package StorageService

import (
	"app/config"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

const uploadsRoot = "uploads"

type StorageStats struct {
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

var (
	mu       sync.RWMutex
	cached   StorageStats
	hasCache bool
	scanning bool
	scanTTL  time.Duration
)

func Start() {
	scanTTL = time.Duration(config.StorageScanIntervalMinutes) * time.Minute
	go scanAndCache()
}

func GetStorageStats() StorageStats {
	mu.RLock()
	stale := !hasCache || time.Since(cached.ScannedAt) > scanTTL
	stats := cached
	has := hasCache
	mu.RUnlock()

	if !has {
		return scanAndCacheSync()
	}

	if stale {
		go scanAndCache()
	}

	return stats
}

func RefreshStorageStats() StorageStats {
	return scanAndCacheSync()
}

func scanAndCache() {
	mu.Lock()
	if scanning {
		mu.Unlock()
		return
	}
	scanning = true
	mu.Unlock()

	stats := walkUploads()

	mu.Lock()
	cached = stats
	hasCache = true
	scanning = false
	mu.Unlock()
}

func scanAndCacheSync() StorageStats {
	stats := walkUploads()
	mu.Lock()
	cached = stats
	hasCache = true
	scanning = false
	mu.Unlock()
	return stats
}

func walkUploads() StorageStats {
	start := time.Now()
	stats := StorageStats{
		OutputByType: map[string]int64{
			"splits":        0,
			"merges":        0,
			"gifs":          0,
			"extract-audio": 0,
			"editor":        0,
		},
	}

	if _, err := os.Stat(uploadsRoot); os.IsNotExist(err) {
		stats.ScannedAt = time.Now()
		stats.ScanDurationMs = time.Since(start).Milliseconds()
		fillDiskUsage(&stats)
		return stats
	}

	_ = filepath.WalkDir(uploadsRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil
		}

		size := info.Size()
		stats.FileCount++
		stats.TotalBytes += size

		rel, err := filepath.Rel(uploadsRoot, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)

		switch classifyPath(rel) {
		case "input":
			stats.InputsBytes += size
		case "tmp":
			stats.TmpBytes += size
		default:
			stats.OutputBytes += size
			if outputType := outputTypeFromPath(rel); outputType != "" {
				stats.OutputByType[outputType] += size
			}
		}

		return nil
	})

	stats.ScannedAt = time.Now()
	stats.ScanDurationMs = time.Since(start).Milliseconds()
	fillDiskUsage(&stats)
	return stats
}

func classifyPath(rel string) string {
	if strings.HasPrefix(rel, "output/") {
		return "output"
	}
	if strings.HasPrefix(rel, "tmp/") {
		return "tmp"
	}
	if !strings.Contains(rel, "/") {
		return "input"
	}
	return "other"
}

func outputTypeFromPath(rel string) string {
	if !strings.HasPrefix(rel, "output/") {
		return ""
	}
	rest := strings.TrimPrefix(rel, "output/")
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) == 0 || parts[0] == "" {
		return ""
	}
	return parts[0]
}

func fillDiskUsage(stats *StorageStats) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(uploadsRoot, &stat); err != nil {
		return
	}
	bs := fsBlockSize(&stat)
	stats.DiskTotalBytes = int64(stat.Blocks) * bs
	stats.DiskFreeBytes = int64(stat.Bavail) * bs
}
