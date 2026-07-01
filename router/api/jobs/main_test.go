package jobs

import "testing"

func TestSanitizeDownloadFilename(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"my-video.mp4", "my-video.mp4"},
		{"../secret/name", "name"},
		{"", "download"},
		{"   ", "download"},
		{"clip/with\\slashes", "withslashes"},
	}

	for _, tt := range tests {
		if got := sanitizeDownloadFilename(tt.in); got != tt.want {
			t.Errorf("sanitizeDownloadFilename(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestUniqueZipEntryName(t *testing.T) {
	seen := make(map[string]int)

	if got := uniqueZipEntryName("part-1.mp4", seen); got != "part-1.mp4" {
		t.Fatalf("first entry = %q", got)
	}
	if got := uniqueZipEntryName("part-1.mp4", seen); got != "part-1_2.mp4" {
		t.Fatalf("duplicate entry = %q", got)
	}
	if got := uniqueZipEntryName("part-2.mp4", seen); got != "part-2.mp4" {
		t.Fatalf("other entry = %q", got)
	}
}
