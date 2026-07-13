package youtubedownload

import "testing"

func TestChunkSizeFromBitrate(t *testing.T) {
	tests := []struct {
		name string
		abr  float64
		want int64
	}{
		{name: "unknown", abr: 0, want: streamDefaultChunk},
		{name: "negative", abr: -1, want: streamDefaultChunk},
		// 128 kbps * 125 * 8s = 128000 → clamp to min 256KiB
		{name: "audioLow", abr: 128, want: streamMinChunk},
		// 500 kbps * 125 * 8 = 500000
		{name: "mid", abr: 500, want: 500 * 125 * streamBufferSeconds},
		// 5000 kbps * 125 * 8 = 5_000_000 → clamp to max 1MiB
		{name: "videoHigh", abr: 5000, want: streamMaxChunk},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := chunkSizeFromBitrate(tt.abr)
			if got != tt.want {
				t.Fatalf("chunkSizeFromBitrate(%v) = %d, want %d", tt.abr, got, tt.want)
			}
		})
	}
}

func TestClampByteRange(t *testing.T) {
	const maxChunk int64 = 512 << 10

	tests := []struct {
		name   string
		header string
		start  int64
		end    int64
	}{
		{name: "empty", header: "", start: 0, end: maxChunk - 1},
		{name: "openEnded", header: "bytes=0-", start: 0, end: maxChunk - 1},
		{name: "openEndedSeek", header: "bytes=1048576-", start: 1048576, end: 1048576 + maxChunk - 1},
		{name: "closedWithin", header: "bytes=0-1023", start: 0, end: 1023},
		{name: "closedTooLarge", header: "bytes=0-99999999", start: 0, end: maxChunk - 1},
		{name: "closedSeekCap", header: "bytes=1000-999999", start: 1000, end: 1000 + maxChunk - 1},
		{name: "suffix", header: "bytes=-500", start: 0, end: maxChunk - 1},
		{name: "multiIgnoreRest", header: "bytes=0-100,200-300", start: 0, end: 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			start, end := clampByteRange(tt.header, maxChunk)
			if start != tt.start || end != tt.end {
				t.Fatalf("clampByteRange(%q) = %d-%d, want %d-%d", tt.header, start, end, tt.start, tt.end)
			}
		})
	}
}
