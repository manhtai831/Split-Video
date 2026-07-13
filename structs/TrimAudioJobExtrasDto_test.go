package structs

import "testing"

func TestParseTrimAudioForm_DefaultsStartFade(t *testing.T) {
	extras, err := ParseTrimAudioForm(map[string]string{
		"end": "10",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.Start != 0 {
		t.Fatalf("expected start 0, got %v", extras.Start)
	}
	if extras.End != 10 {
		t.Fatalf("expected end 10, got %v", extras.End)
	}
	if extras.FadeIn != 0 || extras.FadeOut != 0 {
		t.Fatalf("expected fade 0, got in=%v out=%v", extras.FadeIn, extras.FadeOut)
	}
}

func TestParseTrimAudioForm_Decimals(t *testing.T) {
	extras, err := ParseTrimAudioForm(map[string]string{
		"start":    "1.25",
		"end":      "12.5",
		"fade_in":  "0.5",
		"fade_out": "1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.Start != 1.25 || extras.End != 12.5 || extras.FadeIn != 0.5 || extras.FadeOut != 1 {
		t.Fatalf("unexpected extras: %+v", extras)
	}
}

func TestParseTrimAudioForm_LegacyFade(t *testing.T) {
	extras, err := ParseTrimAudioForm(map[string]string{
		"start": "0",
		"end":   "10",
		"fade":  "0.5",
	})
	if err != nil {
		t.Fatal(err)
	}
	if extras.FadeIn != 0.5 || extras.FadeOut != 0.5 {
		t.Fatalf("expected legacy fade mapped to both, got in=%v out=%v", extras.FadeIn, extras.FadeOut)
	}
}

func TestParseTrimAudioForm_MissingEnd(t *testing.T) {
	_, err := ParseTrimAudioForm(map[string]string{
		"start": "0",
	})
	if err == nil {
		t.Fatal("expected error for missing end")
	}
}

func TestParseTrimAudioForm_EndNotGreaterThanStart(t *testing.T) {
	_, err := ParseTrimAudioForm(map[string]string{
		"start": "5",
		"end":   "5",
	})
	if err == nil {
		t.Fatal("expected error when end <= start")
	}
}

func TestParseTrimAudioForm_FadeTooLong(t *testing.T) {
	_, err := ParseTrimAudioForm(map[string]string{
		"start":    "0",
		"end":      "2",
		"fade_in":  "1.5",
		"fade_out": "1",
	})
	if err == nil {
		t.Fatal("expected error when fade_in+fade_out > duration")
	}
}

func TestParseTrimAudioForm_NegativeStart(t *testing.T) {
	_, err := ParseTrimAudioForm(map[string]string{
		"start": "-1",
		"end":   "5",
	})
	if err == nil {
		t.Fatal("expected error for negative start")
	}
}

func TestParseTrimAudioJobExtrasJSON_RoundTrip(t *testing.T) {
	original, err := ParseTrimAudioForm(map[string]string{
		"start":    "3.5",
		"end":      "20",
		"fade_in":  "1",
		"fade_out": "0.5",
	})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := original.ToJSON()
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseTrimAudioJobExtrasJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Start != 3.5 || parsed.End != 20 || parsed.FadeIn != 1 || parsed.FadeOut != 0.5 {
		t.Fatalf("round trip mismatch: %+v", parsed)
	}
}

func TestParseTrimAudioJobExtrasJSON_LegacyFade(t *testing.T) {
	parsed, err := ParseTrimAudioJobExtrasJSON(`{"start":0,"end":10,"fade":1.5}`)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.FadeIn != 1.5 || parsed.FadeOut != 1.5 {
		t.Fatalf("expected legacy fade mapped, got %+v", parsed)
	}
}
