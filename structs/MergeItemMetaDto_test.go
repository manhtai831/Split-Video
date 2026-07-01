package structs

import "testing"

func TestParseItemsMeta_valid(t *testing.T) {
	raw := `[
		{"index":0,"kind":"video"},
		{"index":1,"kind":"image","hold_duration":2},
		{"index":2,"kind":"gif","hold_duration":0}
	]`
	items, err := ParseItemsMeta(raw, 3)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(items))
	}
	if items[1].Kind != "image" || items[1].HoldDuration != 2 {
		t.Fatalf("unexpected image item: %+v", items[1])
	}
}

func TestParseItemsMeta_imageDurationTooLow(t *testing.T) {
	raw := `[{"index":0,"kind":"image","hold_duration":0.1},{"index":1,"kind":"video"}]`
	_, err := ParseItemsMeta(raw, 2)
	if err == nil {
		t.Fatal("expected error for image hold_duration < 0.5")
	}
}

func TestParseItemsMeta_gifZeroAllowed(t *testing.T) {
	raw := `[{"index":0,"kind":"gif","hold_duration":0},{"index":1,"kind":"video"}]`
	items, err := ParseItemsMeta(raw, 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if items[0].HoldDuration != 0 {
		t.Fatalf("expected hold_duration 0, got %v", items[0].HoldDuration)
	}
}

func TestParseItemsMeta_countMismatch(t *testing.T) {
	raw := `[{"index":0,"kind":"video"},{"index":1,"kind":"video"}]`
	_, err := ParseItemsMeta(raw, 3)
	if err == nil {
		t.Fatal("expected count mismatch error")
	}
}
