package structs

import "testing"

func TestParseMergeForm_defaults(t *testing.T) {
	extras, err := ParseMergeForm(map[string]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if extras.OutputExt != "mp4" {
		t.Fatalf("expected mp4, got %q", extras.OutputExt)
	}
	if extras.Encode.VideoCodec != "libx264" {
		t.Fatalf("expected libx264, got %q", extras.Encode.VideoCodec)
	}
	if extras.Encode.Scale != "1080:-2" {
		t.Fatalf("expected 1080:-2 scale, got %q", extras.Encode.Scale)
	}
}

func TestParseMergeForm_keepCopy(t *testing.T) {
	extras, err := ParseMergeForm(map[string]string{
		"size":        "keep",
		"audio_codec": "copy",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if extras.Encode.VideoCodec != "copy" {
		t.Fatalf("expected copy video codec, got %q", extras.Encode.VideoCodec)
	}
	if extras.Encode.AudioCodec != "copy" {
		t.Fatalf("expected copy audio codec, got %q", extras.Encode.AudioCodec)
	}
}

func TestParseMergeForm_requiresTwoClipsValidationInRouter(t *testing.T) {
	_, err := ParseMergeForm(map[string]string{
		"size":        "keep",
		"audio_codec": "aac",
	})
	if err == nil {
		t.Fatal("expected error for aac with keep size")
	}
}
