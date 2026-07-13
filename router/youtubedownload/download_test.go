package youtubedownload

import (
	"strings"
	"testing"
)

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "empty", input: "", want: ""},
		{name: "spaces", input: "  hello world  ", want: "hello world"},
		{name: "pathChars", input: `a/b\c:d*e?f"g<h>i|j`, want: "abcdefghij"},
		{name: "dots", input: "...title...", want: "title"},
		{name: "control", input: "a\x00b\nc", want: "abc"},
		{name: "unicode", input: "Bài hát hay", want: "Bài hát hay"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeFilename(tt.input)
			if got != tt.want {
				t.Fatalf("sanitizeFilename(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestSanitizeFilenameTruncates(t *testing.T) {
	long := strings.Repeat("a", 250)
	got := sanitizeFilename(long)
	if len(got) > 180 {
		t.Fatalf("len=%d, want <= 180", len(got))
	}
}

func TestDownloadFilename(t *testing.T) {
	tests := []struct {
		name  string
		title string
		ext   string
		want  string
	}{
		{name: "basic", title: "My Video", ext: "mp4", want: "My Video.mp4"},
		{name: "extWithDot", title: "Song", ext: ".webm", want: "Song.webm"},
		{name: "emptyTitle", title: "", ext: "m4a", want: "download.m4a"},
		{name: "alreadyHasExt", title: "clip.mp4", ext: "mp4", want: "clip.mp4"},
		{name: "noExt", title: "clip", ext: "", want: "clip"},
		{name: "unsafe", title: `foo/bar`, ext: "mp3", want: "foobar.mp3"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := downloadFilename(tt.title, tt.ext)
			if got != tt.want {
				t.Fatalf("downloadFilename(%q, %q) = %q, want %q", tt.title, tt.ext, got, tt.want)
			}
		})
	}
}

func TestContentDispositionAttachment(t *testing.T) {
	got := contentDispositionAttachment("Hello World", "mp4")
	if !strings.Contains(got, `attachment; filename="Hello World.mp4"`) {
		t.Fatalf("missing ascii filename: %q", got)
	}
	if !strings.Contains(got, "filename*=UTF-8''Hello%20World.mp4") {
		t.Fatalf("missing utf8 filename*: %q", got)
	}

	gotVN := contentDispositionAttachment("Bài hát", "m4a")
	if !strings.HasPrefix(gotVN, `attachment; filename="`) {
		t.Fatalf("missing attachment prefix: %q", gotVN)
	}
	if !strings.Contains(gotVN, "filename*=UTF-8''") {
		t.Fatalf("missing utf8 form: %q", gotVN)
	}
	if strings.Contains(gotVN, "/") || strings.Contains(gotVN, `\`) {
		t.Fatalf("unsafe chars in disposition: %q", gotVN)
	}
}

func TestPercentEncodeFilename(t *testing.T) {
	got := percentEncodeFilename("a b.mp4")
	if got != "a%20b.mp4" {
		t.Fatalf("got %q, want a%%20b.mp4", got)
	}
}

func TestParseContentRangeTotal(t *testing.T) {
	tests := []struct {
		name  string
		cr    string
		total int64
		ok    bool
	}{
		{name: "ok", cr: "bytes 0-0/12345", total: 12345, ok: true},
		{name: "star", cr: "bytes 0-0/*", ok: false},
		{name: "empty", cr: "", ok: false},
		{name: "rangePart", cr: "bytes 100-199/1000", total: 1000, ok: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			total, ok := parseContentRangeTotal(tt.cr)
			if ok != tt.ok || total != tt.total {
				t.Fatalf("parseContentRangeTotal(%q) = %d,%v want %d,%v", tt.cr, total, ok, tt.total, tt.ok)
			}
		})
	}
}

func TestDownloadPartRanges(t *testing.T) {
	parts := downloadPartRanges(10*1024*1024, 4<<20)
	if len(parts) != 3 {
		t.Fatalf("len=%d want 3", len(parts))
	}
	if parts[0][0] != 0 || parts[0][1] != (4<<20)-1 {
		t.Fatalf("part0=%v", parts[0])
	}
	if parts[2][1] != 10*1024*1024-1 {
		t.Fatalf("last end=%d", parts[2][1])
	}
	if downloadPartRanges(0, 4<<20) != nil {
		t.Fatal("expected nil for zero total")
	}
}

