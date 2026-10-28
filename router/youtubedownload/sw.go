package youtubedownload

import (
	"app/assets"
	"net/http"
	"os"
	"path/filepath"
)

const streamSWLogicalPath = "js/youtube-download-stream-sw.js"

func handleServiceWorker(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := streamSWFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, "Service worker not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	// Allow scope covering /video/youtube-download (no trailing slash).
	w.Header().Set("Service-Worker-Allowed", "/")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(data)
}

func streamSWFilePath() string {
	if hashed, ok := assets.Manifest[streamSWLogicalPath]; ok && hashed != "" {
		p := filepath.Join("dist/static", filepath.FromSlash(hashed))
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	candidates := []string{
		"dist/static/js/youtube-download-stream-sw.js",
		"public/static/js/youtube-download-stream-sw.js",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "public/static/js/youtube-download-stream-sw.js"
}
