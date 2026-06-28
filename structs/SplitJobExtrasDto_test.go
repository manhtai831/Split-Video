package structs

import (
	"strings"
	"testing"
)

func TestParseSplitForm_ReencodeDefaults(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size": "1920",
	})
	if err != nil {
		t.Fatal(err)
	}

	enc := extras.Encode
	if enc.Scale != "1920:-2" {
		t.Fatalf("expected scale 1920:-2, got %q", enc.Scale)
	}
	if enc.VideoCodec != "libx264" {
		t.Fatalf("expected libx264, got %q", enc.VideoCodec)
	}
	if enc.CRF != 23 {
		t.Fatalf("expected crf 23, got %d", enc.CRF)
	}
	if enc.FPS != 0 {
		t.Fatalf("expected fps 0 (default), got %d", enc.FPS)
	}
	if enc.Preset != "medium" {
		t.Fatalf("expected preset medium, got %q", enc.Preset)
	}
	if enc.AudioCodec != "aac" {
		t.Fatalf("expected aac, got %q", enc.AudioCodec)
	}
	if enc.AudioBitrate != "128k" {
		t.Fatalf("expected audio bitrate 128k, got %q", enc.AudioBitrate)
	}
	if enc.Mute {
		t.Fatal("expected mute false")
	}
}

func TestParseSplitForm_FPSDefault(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size": "1080",
		"fps":  "default",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.Encode.FPS != 0 {
		t.Fatalf("expected fps 0 for default, got %d", extras.Encode.FPS)
	}
	args := extras.Encode.BuildArgs()
	for _, arg := range args {
		if arg == "-r" {
			t.Fatalf("did not expect -r in args for default fps, got %v", args)
		}
	}
}

func TestParseSplitForm_FPSExplicit(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size": "1080",
		"fps":  "30",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.Encode.FPS != 30 {
		t.Fatalf("expected fps 30, got %d", extras.Encode.FPS)
	}
}

func TestParseSplitForm_KeepCopy(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":        "keep",
		"audio_codec": "copy",
	})
	if err != nil {
		t.Fatal(err)
	}

	enc := extras.Encode
	if enc.VideoCodec != "copy" {
		t.Fatalf("expected video copy, got %q", enc.VideoCodec)
	}
	if enc.AudioCodec != "copy" {
		t.Fatalf("expected audio copy, got %q", enc.AudioCodec)
	}
	if enc.Scale != "" {
		t.Fatalf("expected empty scale, got %q", enc.Scale)
	}
	if enc.Mute {
		t.Fatal("expected mute false")
	}
}

func TestParseSplitForm_KeepMute(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":        "keep",
		"audio_codec": "mute",
	})
	if err != nil {
		t.Fatal(err)
	}

	enc := extras.Encode
	if enc.VideoCodec != "copy" {
		t.Fatalf("expected video copy, got %q", enc.VideoCodec)
	}
	if !enc.Mute {
		t.Fatal("expected mute true")
	}
	if enc.AudioCodec != "" {
		t.Fatalf("expected empty audio codec, got %q", enc.AudioCodec)
	}
}

func TestParseSplitForm_ReencodeMute(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":        "720",
		"audio_codec": "mute",
		"crf":         "26",
		"fps":         "30",
		"preset":      "fast",
	})
	if err != nil {
		t.Fatal(err)
	}

	enc := extras.Encode
	if enc.Scale != "720:-2" {
		t.Fatalf("expected scale 720:-2, got %q", enc.Scale)
	}
	if !enc.Mute {
		t.Fatal("expected mute true")
	}
	if enc.CRF != 26 || enc.FPS != 30 || enc.Preset != "fast" {
		t.Fatalf("unexpected encode opts: %+v", enc)
	}

	args := enc.BuildArgs()
	if !containsArgPair(args, "-an") {
		t.Fatalf("expected -an in args, got %v", args)
	}
	if containsArgPair(args, "-c:a") {
		t.Fatalf("did not expect -c:a in args, got %v", args)
	}
}

func TestParseSplitForm_InvalidCRF(t *testing.T) {
	_, err := ParseSplitForm(map[string]string{
		"size": "1080",
		"crf":  "10",
	})
	if err == nil {
		t.Fatal("expected error for invalid crf")
	}
}

func TestParseSplitForm_KeepWithAACRejected(t *testing.T) {
	_, err := ParseSplitForm(map[string]string{
		"size":        "keep",
		"audio_codec": "aac",
	})
	if err == nil {
		t.Fatal("expected error for aac with keep")
	}
}

func TestSplitJobExtrasDto_ToJSONRoundTrip(t *testing.T) {
	original, err := ParseSplitForm(map[string]string{
		"size":           "1080",
		"crf":            "23",
		"fps":            "15",
		"preset":         "medium",
		"audio_codec":    "aac",
		"audio_bitrate":  "192k",
	})
	if err != nil {
		t.Fatal(err)
	}

	raw, err := original.ToJSON()
	if err != nil {
		t.Fatal(err)
	}

	parsed, err := ParseSplitJobExtrasJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Encode.Scale != "1080:-2" {
		t.Fatalf("round trip failed: %+v", parsed.Encode)
	}
}

func TestParseSplitForm_SplitSizeZero(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":       "1080",
		"split_size": "0",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.SizeLimit != 0 {
		t.Fatalf("expected size limit 0, got %d", extras.SizeLimit)
	}
}

func TestParseSplitForm_SplitSizeMB(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":       "1080",
		"split_size": "8",
		"split_unit": "mb",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := int64(8 * 1024 * 1024)
	if extras.SizeLimit != want {
		t.Fatalf("expected size limit %d, got %d", want, extras.SizeLimit)
	}
}

func TestParseSplitForm_SplitSizeKB(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":       "1080",
		"split_size": "512",
		"split_unit": "kb",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := int64(512 * 1024)
	if extras.SizeLimit != want {
		t.Fatalf("expected size limit %d, got %d", want, extras.SizeLimit)
	}
}

func TestParseSplitForm_SplitSizeInvalidUnit(t *testing.T) {
	_, err := ParseSplitForm(map[string]string{
		"size":       "1080",
		"split_size": "10",
		"split_unit": "tb",
	})
	if err == nil {
		t.Fatal("expected error for invalid split_unit")
	}
}

func TestParseSplitForm_SplitSizeNegative(t *testing.T) {
	_, err := ParseSplitForm(map[string]string{
		"size":       "1080",
		"split_size": "-1",
	})
	if err == nil {
		t.Fatal("expected error for negative split_size")
	}
}

func containsArgPair(args []string, key string) bool {
	for i, arg := range args {
		if arg == key {
			return true
		}
		if strings.HasPrefix(key, "-") && i > 0 && args[i-1] == key {
			return true
		}
	}
	for _, arg := range args {
		if arg == key {
			return true
		}
	}
	return false
}
