package config

import (
	"os"
	"strconv"
	"strings"
)

const (
	defaultRetentionDays           = 30
	defaultOGImage                 = "/static/logo_hoz.svg"
	defaultStorageScanIntervalMins = 5
)

var (
	SiteURL                    string
	FileRetentionDays          int
	StorageScanIntervalMinutes int
	AdminUsername              string
	AdminPassword              string
	DefaultOGImagePath         = defaultOGImage
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
