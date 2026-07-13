package youtubedownload

import (
	"app/services/YoutubePlaylistService"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

const (
	// ~N seconds of media per stream hop, derived from format bitrate.
	streamBufferSeconds = 20
	streamMinChunk      = 256 << 10 // 256 KiB — enough for container headers
	streamMaxChunk      = 20 << 20  // 20 MiB cap
	streamDefaultChunk  = 512 << 10 // fallback when abr unknown
)

var streamHTTPClient = &http.Client{
	Transport: &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ResponseHeaderTimeout: 30 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   16,
		ForceAttemptHTTP2:     true,
	},
}

var streamForwardHeaders = []string{
	"Content-Type",
	"Content-Length",
	"Content-Range",
	"Accept-Ranges",
	"Content-Disposition",
}

func handleStream(w http.ResponseWriter, r *http.Request, id int, userID string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	formatID := r.URL.Query().Get("format_id")
	resolved, err := YoutubePlaylistService.ResolveFormat(r.Context(), id, userID, formatID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Không tìm thấy mục playlist", http.StatusNotFound)
			return
		}
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "không lấy được") || strings.Contains(err.Error(), "yt-dlp") {
			status = http.StatusBadGateway
		}
		http.Error(w, err.Error(), status)
		return
	}

	maxChunk := chunkSizeFromBitrate(resolved.Abr)
	start, end := clampByteRange(r.Header.Get("Range"), maxChunk)

	upstream, err := http.NewRequestWithContext(r.Context(), http.MethodGet, resolved.URL, nil)
	if err != nil {
		http.Error(w, "Không tạo được request media", http.StatusInternalServerError)
		return
	}
	upstream.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, end))
	if ua := r.Header.Get("User-Agent"); ua != "" {
		upstream.Header.Set("User-Agent", ua)
	} else {
		upstream.Header.Set("User-Agent", "Mozilla/5.0")
	}

	resp, err := streamHTTPClient.Do(upstream)
	if err != nil {
		if r.Context().Err() != nil {
			return
		}
		http.Error(w, "Không tải được media từ nguồn", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		http.Error(w, "Nguồn media trả lỗi", http.StatusBadGateway)
		return
	}

	for _, key := range streamForwardHeaders {
		if v := resp.Header.Get(key); v != "" {
			w.Header().Set(key, v)
		}
	}
	w.Header().Set("Accept-Ranges", "bytes")
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", contentTypeForExt(resolved.Ext, string(resolved.Kind)))
	}

	body := io.Reader(resp.Body)
	status := resp.StatusCode

	// Upstream ignored Range and returned the full object — still only expose one chunk.
	if status == http.StatusOK {
		total := resp.ContentLength
		chunkLen := end - start + 1
		if total >= 0 {
			if start >= total {
				http.Error(w, "Range không hợp lệ", http.StatusRequestedRangeNotSatisfiable)
				return
			}
			if start+chunkLen > total {
				chunkLen = total - start
				end = start + chunkLen - 1
			}
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, total))
		} else {
			// Unknown total: still cap bytes; player may not seek well.
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/*", start, end))
		}
		w.Header().Set("Content-Length", strconv.FormatInt(chunkLen, 10))
		status = http.StatusPartialContent
		body = io.LimitReader(resp.Body, chunkLen)
	}

	w.WriteHeader(status)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = io.Copy(w, body)
}

// chunkSizeFromBitrate estimates bytes for ~streamBufferSeconds of media.
// abr is kbps (yt-dlp abr/tbr). Falls back when unknown.
func chunkSizeFromBitrate(abrKbps float64) int64 {
	if abrKbps <= 0 {
		return streamDefaultChunk
	}
	// bytes = kbps * 1000/8 * seconds = kbps * 125 * seconds
	size := int64(abrKbps * 125 * float64(streamBufferSeconds))
	if size < streamMinChunk {
		return streamMinChunk
	}
	if size > streamMaxChunk {
		return streamMaxChunk
	}
	return size
}

// clampByteRange parses a client Range header and returns an inclusive byte
// window of at most maxChunk. Missing or open-ended ranges start at 0 (or the
// requested start) and are capped to maxChunk bytes.
func clampByteRange(rangeHeader string, maxChunk int64) (start, end int64) {
	if maxChunk < 1 {
		maxChunk = streamDefaultChunk
	}
	start = 0
	end = maxChunk - 1

	rangeHeader = strings.TrimSpace(rangeHeader)
	if rangeHeader == "" || !strings.HasPrefix(strings.ToLower(rangeHeader), "bytes=") {
		return start, end
	}

	spec := strings.TrimSpace(rangeHeader[len("bytes="):])
	// Only the first range is used (media elements send a single range).
	if i := strings.IndexByte(spec, ','); i >= 0 {
		spec = spec[:i]
	}
	spec = strings.TrimSpace(spec)

	if strings.HasPrefix(spec, "-") {
		// Suffix form bytes=-N — still return a short window from 0; total size
		// is unknown here. Upstream seek will refine on later requests.
		return 0, maxChunk - 1
	}

	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return start, end
	}

	if parts[0] != "" {
		if v, err := strconv.ParseInt(parts[0], 10, 64); err == nil && v >= 0 {
			start = v
		}
	}

	end = start + maxChunk - 1
	if parts[1] != "" {
		if v, err := strconv.ParseInt(parts[1], 10, 64); err == nil && v >= start {
			if v < end {
				end = v
			}
		}
	}
	return start, end
}

func contentTypeForExt(ext, kind string) string {
	switch strings.ToLower(ext) {
	case "mp4", "m4a", "m4v":
		if kind == "audio" {
			return "audio/mp4"
		}
		return "video/mp4"
	case "webm":
		if kind == "audio" {
			return "audio/webm"
		}
		return "video/webm"
	case "mp3":
		return "audio/mpeg"
	case "opus":
		return "audio/ogg"
	default:
		if kind == "audio" {
			return "audio/mpeg"
		}
		return "application/octet-stream"
	}
}
