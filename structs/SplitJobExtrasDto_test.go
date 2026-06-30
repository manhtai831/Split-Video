package structs

import (
	"app/enums"
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

func TestParseSplitForm_SplitTimeMinutes(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":             "1080",
		"split_mode":       "time",
		"split_time":       "5",
		"split_time_unit":  "min",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.SplitMode != enums.SplitModeTime {
		t.Fatalf("expected split_mode time, got %q", extras.SplitMode)
	}
	if extras.TimeLimit != 300 {
		t.Fatalf("expected time limit 300, got %v", extras.TimeLimit)
	}
	if extras.SizeLimit != 0 {
		t.Fatalf("expected size limit 0, got %d", extras.SizeLimit)
	}
}

func TestParseSplitForm_SplitTimeZero(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":       "1080",
		"split_mode": "time",
		"split_time": "0",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.TimeLimit != 0 {
		t.Fatalf("expected time limit 0, got %v", extras.TimeLimit)
	}
}

func TestParseSplitForm_SplitTimeInvalidUnit(t *testing.T) {
	_, err := ParseSplitForm(map[string]string{
		"size":            "1080",
		"split_mode":      "time",
		"split_time":      "10",
		"split_time_unit": "day",
	})
	if err == nil {
		t.Fatal("expected error for invalid split_time_unit")
	}
}

func TestParseSplitForm_SplitTimeNegative(t *testing.T) {
	_, err := ParseSplitForm(map[string]string{
		"size":       "1080",
		"split_mode": "time",
		"split_time": "-1",
	})
	if err == nil {
		t.Fatal("expected error for negative split_time")
	}
}

func TestParseSplitForm_SplitTimeJSONRoundTrip(t *testing.T) {
	original, err := ParseSplitForm(map[string]string{
		"size":            "1080",
		"split_mode":      "time",
		"split_time":      "2",
		"split_time_unit": "hour",
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
	if parsed.SplitMode != enums.SplitModeTime || parsed.TimeLimit != 7200 {
		t.Fatalf("round trip failed: %+v", parsed)
	}
}

func TestParseSplitForm_DefaultSizeMode(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":       "1080",
		"split_size": "8",
		"split_unit": "mb",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.SplitMode != enums.SplitModeSize {
		t.Fatalf("expected split_mode size, got %q", extras.SplitMode)
	}
	want := int64(8 * 1024 * 1024)
	if extras.SizeLimit != want {
		t.Fatalf("expected size limit %d, got %d", want, extras.SizeLimit)
	}
}

func TestParseSplitForm_OutputFormatDefault(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size": "1080",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.OutputExt != "mp4" {
		t.Fatalf("expected output_ext mp4, got %q", extras.OutputExt)
	}
}

func TestParseSplitForm_OutputFormatExplicit(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"mov", "mov"},
		{"mkv", "mkv"},
		{"avi", "avi"},
		{"webm", "webm"},
		{"m4v", "m4v"},
		{"flv", "flv"},
		{"ts", "ts"},
	}
	for _, tc := range cases {
		extras, err := ParseSplitForm(map[string]string{
			"size":          "1080",
			"output_format": tc.input,
		})
		if err != nil {
			t.Fatalf("output_format %q: %v", tc.input, err)
		}
		if extras.OutputExt != tc.want {
			t.Fatalf("output_format %q: got %q, want %q", tc.input, extras.OutputExt, tc.want)
		}
	}
}

func TestParseSplitForm_InvalidOutputFormat(t *testing.T) {
	_, err := ParseSplitForm(map[string]string{
		"size":          "1080",
		"output_format": "wmv",
	})
	if err == nil {
		t.Fatal("expected error for invalid output_format")
	}
}

func TestParseSplitForm_WebmUsesVP9Opus(t *testing.T) {
	extras, err := ParseSplitForm(map[string]string{
		"size":          "1080",
		"output_format": "webm",
		"audio_codec":   "aac",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.Encode.VideoCodec != "libvpx-vp9" {
		t.Fatalf("expected libvpx-vp9, got %q", extras.Encode.VideoCodec)
	}
	if extras.Encode.AudioCodec != "libopus" {
		t.Fatalf("expected libopus, got %q", extras.Encode.AudioCodec)
	}
	if extras.Encode.Preset != "" {
		t.Fatalf("expected empty preset for webm, got %q", extras.Encode.Preset)
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
