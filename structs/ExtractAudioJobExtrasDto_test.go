package structs

import (
	"strings"
	"testing"
)

func TestParseExtractAudioForm_Defaults(t *testing.T) {
	extras, err := ParseExtractAudioForm(map[string]string{})
	if err != nil {
		t.Fatal(err)
	}
	if extras.OutputFormat != "mp3" {
		t.Fatalf("expected mp3, got %q", extras.OutputFormat)
	}
	if extras.AudioBitrate != "original" {
		t.Fatalf("expected original bitrate, got %q", extras.AudioBitrate)
	}
	if extras.Volume != 100 {
		t.Fatalf("expected volume 100, got %v", extras.Volume)
	}
	if extras.Speed != 1 {
		t.Fatalf("expected speed 1, got %v", extras.Speed)
	}
}

func TestParseExtractAudioForm_FullOptions(t *testing.T) {
	extras, err := ParseExtractAudioForm(map[string]string{
		"output_format": "flac",
		"audio_bitrate": "192k",
		"volume":        "150",
		"speed":         "1.5",
		"meta_artist":   "Test Artist",
		"meta_album":    "Test Album",
		"meta_year":     "2024",
		"meta_comment":  "hello",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.OutputFormat != "flac" {
		t.Fatalf("expected flac, got %q", extras.OutputFormat)
	}
	if extras.Metadata.Artist != "Test Artist" {
		t.Fatalf("unexpected artist %q", extras.Metadata.Artist)
	}
	if extras.Metadata.Year != "2024" {
		t.Fatalf("unexpected year %q", extras.Metadata.Year)
	}
	if !extras.NeedsReencode() {
		t.Fatal("expected needs reencode")
	}
}

func TestParseExtractAudioForm_InvalidYear(t *testing.T) {
	_, err := ParseExtractAudioForm(map[string]string{
		"meta_year": "20",
	})
	if err == nil {
		t.Fatal("expected error for invalid year")
	}
}

func TestParseExtractAudioForm_InvalidSpeed(t *testing.T) {
	_, err := ParseExtractAudioForm(map[string]string{
		"speed": "3",
	})
	if err == nil {
		t.Fatal("expected error for invalid speed")
	}
}

func TestParseExtractAudioJobExtrasJSON_RoundTrip(t *testing.T) {
	original, err := ParseExtractAudioForm(map[string]string{
		"output_format": "m4a",
		"audio_bitrate": "128k",
		"speed":         "2",
	})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := original.ToJSON()
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseExtractAudioJobExtrasJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.OutputFormat != "m4a" || parsed.Speed != 2 {
		t.Fatalf("round trip mismatch: %+v", parsed)
	}
}

func TestSanitizeMetadataField_Truncates(t *testing.T) {
	long := strings.Repeat("a", 600)
	got := sanitizeMetadataField(long)
	if len(got) != 500 {
		t.Fatalf("expected len 500, got %d", len(got))
	}
}
