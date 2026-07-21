package config

import (
	"os"
	"strconv"
	"strings"
)

const (
	defaultRetentionDays              = 30
	defaultOGImage                    = "/static/logo_hoz.svg"
	defaultStorageScanIntervalMins    = 5
	defaultUploadChunkSizeMB          = 5
	defaultUploadChunkTTLHours        = 24
	defaultMaxUploadParts             = 10000
	defaultYoutubeFormatsCacheMinutes = 1440 // 1 day
)

var (
	SiteURL                    string
	FileRetentionDays          int
	StorageScanIntervalMinutes int
	AdminUsername              string
	AdminPassword              string
	DefaultOGImagePath         = defaultOGImage
	UploadChunkSizeBytes       int
	UploadChunkTTLHours        int
	MaxUploadParts             int
	YoutubeFormatsCacheMinutes int
	ResendAPIKey               string
	ResendFromEmail            string
	SessionSecret              string
	DiscordWebhookURL          string
)

func init() {
	SiteURL = strings.TrimRight(strings.TrimSpace(os.Getenv("SITE_URL")), "/")

	days := defaultRetentionDays
	if raw := strings.TrimSpace(os.Getenv("FILE_RETENTION_DAYS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			days = parsed
		}
	}
	FileRetentionDays = days

	scanMins := defaultStorageScanIntervalMins
	if raw := strings.TrimSpace(os.Getenv("STORAGE_SCAN_INTERVAL_MINUTES")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			scanMins = parsed
		}
	}
	StorageScanIntervalMinutes = scanMins

	AdminUsername = strings.TrimSpace(os.Getenv("ADMIN_USERNAME"))
	AdminPassword = os.Getenv("ADMIN_PASSWORD")

	chunkMB := defaultUploadChunkSizeMB
	if raw := strings.TrimSpace(os.Getenv("UPLOAD_CHUNK_SIZE_MB")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			chunkMB = parsed
		}
	}
	UploadChunkSizeBytes = chunkMB * 1024 * 1024

	ttlHours := defaultUploadChunkTTLHours
	if raw := strings.TrimSpace(os.Getenv("UPLOAD_CHUNK_TTL_HOURS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			ttlHours = parsed
		}
	}
	UploadChunkTTLHours = ttlHours

	maxParts := defaultMaxUploadParts
	if raw := strings.TrimSpace(os.Getenv("UPLOAD_MAX_PARTS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			maxParts = parsed
		}
	}
	MaxUploadParts = maxParts

	ytCacheMins := defaultYoutubeFormatsCacheMinutes
	if raw := strings.TrimSpace(os.Getenv("YOUTUBE_FORMATS_CACHE_MINUTES")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			ytCacheMins = parsed
		}
	}
	YoutubeFormatsCacheMinutes = ytCacheMins

	ResendAPIKey = strings.TrimSpace(os.Getenv("RESEND_API_KEY"))
	ResendFromEmail = strings.TrimSpace(os.Getenv("RESEND_FROM_EMAIL"))
	SessionSecret = strings.TrimSpace(os.Getenv("SESSION_SECRET"))
	DiscordWebhookURL = strings.TrimSpace(os.Getenv("DISCORD_WEBHOOK_URL"))
}

func AbsURL(path string) string {
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	if SiteURL == "" {
		return path
	}
	return SiteURL + path
}
