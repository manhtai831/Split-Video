package structs

import "testing"

func TestParseGifForm_singleSegment(t *testing.T) {
	fields := map[string]string{
		"start_at":       "1.5",
		"duration":       "5",
		"output_fmt":     "gif",
		"dimension_mode": "aspect_lock",
		"width":          "640",
		"height":         "360",
		"quality_preset": "high",
		"fps":            "10",
		"loop":           "on",
	}
	extras, err := ParseGifForm(fields)
	if err != nil {
		t.Fatal(err)
	}
	if len(extras.Segments) != 1 {
		t.Fatalf("expected 1 segment, got %d", len(extras.Segments))
	}
	if extras.Segments[0].StartAt != 1.5 || extras.Segments[0].Duration != 5 {
		t.Fatalf("unexpected segment: %+v", extras.Segments[0])
	}
	if !extras.Loop {
		t.Fatal("expected loop true")
	}
}

func TestParseGifForm_segmentsJSON(t *testing.T) {
	fields := map[string]string{
		"segments_json":  `[{"start_at":0,"duration":3},{"start_at":10,"duration":5}]`,
		"output_fmt":     "webp",
		"dimension_mode": "manual",
		"width":          "480",
		"height":         "270",
		"quality_preset": "medium",
		"fps":            "15",
	}
	extras, err := ParseGifForm(fields)
	if err != nil {
		t.Fatal(err)
	}
	if len(extras.Segments) != 2 {
		t.Fatalf("expected 2 segments, got %d", len(extras.Segments))
	}
}

func TestParseGifForm_rejectsLongSegment(t *testing.T) {
	fields := map[string]string{
		"start_at":   "0",
		"duration":   "31",
		"width":      "320",
		"height":     "240",
		"fps":        "10",
	}
	_, err := ParseGifForm(fields)
	if err == nil {
		t.Fatal("expected error for duration > 30")
	}
}

func TestResolveDimensions_aspectLock(t *testing.T) {
	width, height, err := ResolveDimensions(GifDimensionDto{
		Mode:   "aspect_lock",
		Width:  640,
		Height: 400,
	}, MediaProbeDto{Width: 1920, Height: 1080})
	if err != nil {
		t.Fatal(err)
	}
	if width != 640 {
		t.Fatalf("expected width 640, got %d", width)
	}
	expectedH := 360
	if height != expectedH {
		t.Fatalf("expected height %d, got %d", expectedH, height)
	}
}

func TestResolveGifQuality_presets(t *testing.T) {
	q := ResolveGifQuality("gif", GifQualityDto{Preset: "low"})
	if q.MaxColors != 64 || q.Dither != "none" {
		t.Fatalf("unexpected gif low quality: %+v", q)
	}
	w := ResolveGifQuality("webp", GifQualityDto{Preset: "max"})
	if !w.Lossless {
		t.Fatal("expected webp max to be lossless")
	}
}
