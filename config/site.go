package config

import (
	"os"
	"strconv"
	"strings"
)

const (
	defaultRetentionDays = 30
	defaultOGImage       = "/static/logo_hoz.svg"
)

var (
	SiteURL            string
	FileRetentionDays  int
	DefaultOGImagePath = defaultOGImage
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
