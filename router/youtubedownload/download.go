package youtubedownload

import (
	"app/services/YoutubePlaylistService"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"unicode"

	"gorm.io/gorm"
)

const (
	downloadWorkers  = 6
	downloadPartSize = 4 << 20 // 4 MiB — parallel Range parts
	downloadMinParallelSize = downloadPartSize // skip parallel for tiny files
)

var downloadForwardHeaders = []string{
	"Content-Type",
	"Content-Length",
	"Content-Range",
	"Accept-Ranges",
}

func handleDownload(w http.ResponseWriter, r *http.Request, id int, userID string) {
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

	item, err := YoutubePlaylistService.GetByIDForUser(id, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Không tìm thấy mục playlist", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	referer := item.WebpageURL
	if referer == "" && item.YoutubeID != "" {
		referer = "https://www.youtube.com/watch?v=" + item.YoutubeID
	}
	ua := r.Header.Get("User-Agent")

	// Client-driven Range (resume / download manager): single passthrough.
	if clientRange := strings.TrimSpace(r.Header.Get("Range")); clientRange != "" {
		proxySingleDownload(w, r, resolved.URL, resolved.Ext, string(resolved.Kind), item.Title, ua, referer, clientRange)
		return
	}

	total := int64(0)
	if probed, err := probeUpstreamSize(r.Context(), resolved.URL, ua, referer); err == nil && probed > 0 {
		total = probed
	} else if resolved.Filesize > 0 {
		total = resolved.Filesize
	}

	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Content-Type", contentTypeForExt(resolved.Ext, string(resolved.Kind)))
	w.Header().Set("Content-Disposition", contentDispositionAttachment(item.Title, resolved.Ext))

	if total > downloadMinParallelSize && r.Method == http.MethodGet {
		w.Header().Set("Content-Length", strconv.FormatInt(total, 10))
		w.WriteHeader(http.StatusOK)
		if err := proxyParallelDownload(r.Context(), w, resolved.URL, ua, referer, total); err != nil {
			// Headers already sent — nothing useful to report to client.
			return
		}
		return
	}

	// Small file, unknown size, or HEAD: single upstream request with Range when possible.
	proxySingleDownload(w, r, resolved.URL, resolved.Ext, string(resolved.Kind), item.Title, ua, referer, "")
}

func proxySingleDownload(w http.ResponseWriter, r *http.Request, mediaURL, ext, kind, title, ua, referer, rangeHeader string) {
	upstream, err := http.NewRequestWithContext(r.Context(), http.MethodGet, mediaURL, nil)
	if err != nil {
		http.Error(w, "Không tạo được request media", http.StatusInternalServerError)
		return
	}
	setYoutubeUpstreamHeaders(upstream, ua, referer)
	if rangeHeader != "" {
		upstream.Header.Set("Range", rangeHeader)
	} else {
		// Prefer ranged fetch — YouTube throttles full-object GETs hard.
		upstream.Header.Set("Range", "bytes=0-")
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

	for _, key := range downloadForwardHeaders {
		if v := resp.Header.Get(key); v != "" {
			w.Header().Set(key, v)
		}
	}
	w.Header().Set("Accept-Ranges", "bytes")
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", contentTypeForExt(ext, kind))
	}
	w.Header().Set("Content-Disposition", contentDispositionAttachment(title, ext))

	status := resp.StatusCode
	// Present full-file download to browser even if we asked upstream for bytes=0-.
	if rangeHeader == "" && status == http.StatusPartialContent {
		if cl := resp.Header.Get("Content-Length"); cl != "" {
			w.Header().Set("Content-Length", cl)
		}
		w.Header().Del("Content-Range")
		status = http.StatusOK
	}

	w.WriteHeader(status)
	if r.Method == http.MethodHead {
		return
	}
	buf := make([]byte, 256<<10) // 256 KiB copy buffer
	_, _ = io.CopyBuffer(w, resp.Body, buf)
}

func probeUpstreamSize(ctx context.Context, mediaURL, ua, referer string) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		return 0, err
	}
	setYoutubeUpstreamHeaders(req, ua, referer)
	req.Header.Set("Range", "bytes=0-0")

	resp, err := streamHTTPClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64))

	if cr := resp.Header.Get("Content-Range"); cr != "" {
		if total, ok := parseContentRangeTotal(cr); ok {
			return total, nil
		}
	}
	if resp.StatusCode == http.StatusOK && resp.ContentLength > 0 {
		return resp.ContentLength, nil
	}
	return 0, fmt.Errorf("không xác định được kích thước")
}

func parseContentRangeTotal(cr string) (int64, bool) {
	// bytes 0-0/12345 or bytes 0-0/*
	cr = strings.TrimSpace(cr)
	if i := strings.LastIndexByte(cr, '/'); i >= 0 && i+1 < len(cr) {
		total := cr[i+1:]
		if total == "*" {
			return 0, false
		}
		n, err := strconv.ParseInt(total, 10, 64)
		if err != nil || n < 1 {
			return 0, false
		}
		return n, true
	}
	return 0, false
}

func downloadPartRanges(total, partSize int64) [][2]int64 {
	if total < 1 || partSize < 1 {
		return nil
	}
	var parts [][2]int64
	for start := int64(0); start < total; start += partSize {
		end := start + partSize - 1
		if end >= total {
			end = total - 1
		}
		parts = append(parts, [2]int64{start, end})
	}
	return parts
}

func proxyParallelDownload(ctx context.Context, w http.ResponseWriter, mediaURL, ua, referer string, total int64) error {
	parts := downloadPartRanges(total, downloadPartSize)
	if len(parts) == 0 {
		return fmt.Errorf("không có phần tải")
	}

	type result struct {
		data []byte
		err  error
	}

	results := make([]chan result, len(parts))
	for i := range results {
		results[i] = make(chan result, 1)
	}

	window := downloadWorkers
	if window > len(parts) {
		window = len(parts)
	}

	var wg sync.WaitGroup
	startJob := func(idx int) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ctx.Err() != nil {
				results[idx] <- result{err: ctx.Err()}
				return
			}
			start, end := parts[idx][0], parts[idx][1]
			data, err := fetchUpstreamRange(ctx, mediaURL, ua, referer, start, end)
			results[idx] <- result{data: data, err: err}
		}()
	}

	nextStart := 0
	for nextStart < window {
		startJob(nextStart)
		nextStart++
	}

	flusher, _ := w.(http.Flusher)
	for i := range parts {
		res := <-results[i]
		if res.err != nil {
			wg.Wait()
			return res.err
		}
		if _, err := w.Write(res.data); err != nil {
			wg.Wait()
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
		if nextStart < len(parts) {
			startJob(nextStart)
			nextStart++
		}
	}
	wg.Wait()
	return nil
}

func fetchUpstreamRange(ctx context.Context, mediaURL, ua, referer string, start, end int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		return nil, err
	}
	setYoutubeUpstreamHeaders(req, ua, referer)
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, end))

	resp, err := streamHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream status %d", resp.StatusCode)
	}

	want := end - start + 1
	data, err := io.ReadAll(io.LimitReader(resp.Body, want+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) != want {
		return nil, fmt.Errorf("range size mismatch: got %d want %d", len(data), want)
	}
	return data, nil
}

func setYoutubeUpstreamHeaders(req *http.Request, ua, referer string) {
	if strings.TrimSpace(ua) == "" {
		ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
	}
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Sec-Fetch-Mode", "no-cors")
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	if referer != "" {
		req.Header.Set("Referer", referer)
		req.Header.Set("Origin", "https://www.youtube.com")
	} else {
		req.Header.Set("Referer", "https://www.youtube.com/")
		req.Header.Set("Origin", "https://www.youtube.com")
	}
}

func contentDispositionAttachment(title, ext string) string {
	filename := downloadFilename(title, ext)
	// ASCII fallback + RFC 5987 UTF-8 form for browsers that support it.
	ascii := sanitizeFilenameASCII(filename)
	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, ascii, percentEncodeFilename(filename))
}

func downloadFilename(title, ext string) string {
	base := sanitizeFilename(title)
	if base == "" {
		base = "download"
	}
	ext = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(ext)), ".")
	if ext == "" {
		return base
	}
	// Avoid double extension if title already ends with .ext
	if strings.HasSuffix(strings.ToLower(base), "."+ext) {
		return base
	}
	return base + "." + ext
}

func sanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(name))
	prevDot := false
	for _, r := range name {
		switch {
		case r < 32 || r == 127:
			continue
		case r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' ||
			r == '"' || r == '<' || r == '>' || r == '|' || r == '\n' || r == '\r':
			continue
		case unicode.IsSpace(r):
			if b.Len() == 0 {
				continue
			}
			b.WriteByte(' ')
			prevDot = false
		case r == '.':
			if b.Len() == 0 || prevDot {
				continue
			}
			b.WriteByte('.')
			prevDot = true
		default:
			b.WriteRune(r)
			prevDot = false
		}
	}
	out := strings.Trim(b.String(), " .")
	if len(out) > 180 {
		out = strings.TrimRight(out[:180], " .")
	}
	return out
}

func sanitizeFilenameASCII(name string) string {
	var b strings.Builder
	b.Grow(len(name))
	for _, r := range name {
		if r >= 0x20 && r <= 0x7e && r != '"' && r != '\\' {
			b.WriteByte(byte(r))
		} else if unicode.IsSpace(r) {
			b.WriteByte(' ')
		} else {
			b.WriteByte('_')
		}
	}
	out := strings.Trim(b.String(), " .")
	if out == "" {
		return "download"
	}
	if len(out) > 180 {
		out = strings.TrimRight(out[:180], " .")
	}
	return out
}

func percentEncodeFilename(name string) string {
	var b strings.Builder
	b.Grow(len(name) * 3)
	for i := 0; i < len(name); i++ {
		c := name[i]
		// RFC 5987 attr-char: ALPHA / DIGIT / "!" / "#" / "$" / "&" / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
			c == '!' || c == '#' || c == '$' || c == '&' || c == '+' || c == '-' ||
			c == '.' || c == '^' || c == '_' || c == '`' || c == '|' || c == '~' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}
