package structs

import "testing"

func TestParseMergeAudioForm_Defaults(t *testing.T) {
	extras, err := ParseMergeAudioForm(map[string]string{})
	if err != nil {
		t.Fatal(err)
	}
	if extras.OutputFormat != "mp3" {
		t.Fatalf("expected mp3, got %q", extras.OutputFormat)
	}
	if extras.AudioBitrate != "original" {
		t.Fatalf("expected original, got %q", extras.AudioBitrate)
	}
}

func TestParseMergeAudioForm_FullOptions(t *testing.T) {
	extras, err := ParseMergeAudioForm(map[string]string{
		"output_format": "flac",
		"audio_bitrate": "192k",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.OutputFormat != "flac" {
		t.Fatalf("expected flac, got %q", extras.OutputFormat)
	}
	if extras.AudioBitrate != "192k" {
		t.Fatalf("expected 192k, got %q", extras.AudioBitrate)
	}
}

func TestParseMergeAudioForm_InvalidFormat(t *testing.T) {
	_, err := ParseMergeAudioForm(map[string]string{
		"output_format": "aac",
	})
	if err == nil {
		t.Fatal("expected error for invalid format")
	}
}

func TestParseMergeAudioForm_InvalidBitrate(t *testing.T) {
	_, err := ParseMergeAudioForm(map[string]string{
		"audio_bitrate": "500k",
	})
	if err == nil {
		t.Fatal("expected error for invalid bitrate")
	}
}

func TestParseMergeAudioJobExtrasJSON_RoundTrip(t *testing.T) {
	original, err := ParseMergeAudioForm(map[string]string{
		"output_format": "m4a",
		"audio_bitrate": "128k",
	})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := original.ToJSON()
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseMergeAudioJobExtrasJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.OutputFormat != "m4a" || parsed.AudioBitrate != "128k" {
		t.Fatalf("round trip mismatch: %+v", parsed)
	}
}

func TestParseMergeAudioJobExtrasJSON_EmptyDefaults(t *testing.T) {
	parsed, err := ParseMergeAudioJobExtrasJSON(`{}`)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.OutputFormat != "mp3" || parsed.AudioBitrate != "original" {
		t.Fatalf("unexpected defaults: %+v", parsed)
	}
}
