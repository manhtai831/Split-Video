package FfmpegService

import (
	"app/structs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteHLSPlaylist(t *testing.T) {
	dir := t.TempDir()
	playlistPath := filepath.Join(dir, "video.m3u8")
	segments := []structs.SegmentResultDto{
		{Index: 1, Path: filepath.Join(dir, "video-1.ts"), Duration: 6.5},
		{Index: 2, Path: filepath.Join(dir, "video-2.ts"), Duration: 4.2},
	}

	if err := WriteHLSPlaylist(playlistPath, segments); err != nil {
		t.Fatalf("WriteHLSPlaylist: %v", err)
	}

	content, err := os.ReadFile(playlistPath)
	if err != nil {
		t.Fatalf("read playlist: %v", err)
	}

	text := string(content)
	if !strings.Contains(text, "#EXTM3U\n") {
		t.Fatal("missing EXTM3U header")
	}
	if !strings.Contains(text, "#EXT-X-TARGETDURATION:7\n") {
		t.Fatalf("unexpected target duration in:\n%s", text)
	}
	if !strings.Contains(text, "#EXTINF:6.500000,\nvideo-1.ts\n") {
		t.Fatalf("missing first segment in:\n%s", text)
	}
	if !strings.Contains(text, "#EXTINF:4.200000,\nvideo-2.ts\n") {
		t.Fatalf("missing second segment in:\n%s", text)
	}
	if !strings.HasSuffix(text, "#EXT-X-ENDLIST\n") {
		t.Fatal("missing ENDLIST tag")
	}
}

func TestWriteHLSPlaylist_usesSegmentName(t *testing.T) {
	dir := t.TempDir()
	playlistPath := filepath.Join(dir, "video.m3u8")
	segments := []structs.SegmentResultDto{
		{Index: 1, Name: "My Upload-1.ts", Path: filepath.Join(dir, "stored-1.ts"), Duration: 6.5},
		{Index: 2, Name: "My Upload-2.ts", Path: filepath.Join(dir, "stored-2.ts"), Duration: 4.2},
	}

	if err := WriteHLSPlaylist(playlistPath, segments); err != nil {
		t.Fatalf("WriteHLSPlaylist: %v", err)
	}

	content, err := os.ReadFile(playlistPath)
	if err != nil {
		t.Fatalf("read playlist: %v", err)
	}

	text := string(content)
	if !strings.Contains(text, "#EXTINF:6.500000,\nMy Upload-1.ts\n") {
		t.Fatalf("expected upload name for first segment in:\n%s", text)
	}
	if !strings.Contains(text, "#EXTINF:4.200000,\nMy Upload-2.ts\n") {
		t.Fatalf("expected upload name for second segment in:\n%s", text)
	}
}

func TestWriteHLSPlaylist_emptySegments(t *testing.T) {
	err := WriteHLSPlaylist(filepath.Join(t.TempDir(), "empty.m3u8"), nil)
	if err == nil {
		t.Fatal("expected error for empty segments")
	}
}
