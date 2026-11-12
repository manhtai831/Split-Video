package structs

import "testing"

func TestParseEditorLayer_text(t *testing.T) {
	raw := map[string]interface{}{
		"id": "layer-1", "kind": "text", "x": 0.2, "y": 0.8,
		"width": 0.6, "height": 0.12, "text": "Hello", "fontSize": 32.0,
		"color": "#ff0000", "zIndex": 2.0, "visible": true,
		"start": 1.0, "end": 5.0,
	}
	layer, err := ParseEditorLayer(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layer.Kind != "text" || layer.Text != "Hello" {
		t.Fatalf("unexpected layer: %+v", layer)
	}
	if layer.FontSize != 32 || layer.ZIndex != 2 {
		t.Fatalf("unexpected font/z: font=%v z=%v", layer.FontSize, layer.ZIndex)
	}
}

func TestEditorLayerPixelRect(t *testing.T) {
	layer := EditorLayerDto{X: 0.1, Y: 0.2, Width: 0.5, Height: 0.25}
	rect := layer.PixelRect(1920, 1080)
	if rect.X != 192 || rect.Y != 216 || rect.W != 960 || rect.H != 270 {
		t.Fatalf("unexpected rect: %+v", rect)
	}
}

func TestEditorLayerEnableExpr(t *testing.T) {
	timed := EditorLayerDto{Start: 2, End: 8}
	if got := timed.EnableExpr(30); got != "between(t,2.000,8.000)" {
		t.Fatalf("unexpected timed expr: %s", got)
	}
	always := EditorLayerDto{AlwaysVisible: true}
	if got := always.EnableExpr(12.5); got != "gte(t,0)*lte(t,12.500)" {
		t.Fatalf("unexpected always expr: %s", got)
	}
}

func TestSortLayersByZIndex_skipsBound(t *testing.T) {
	layers := []EditorLayerDto{
		{ID: "b", Kind: "bound", ZIndex: 0, Visible: true},
		{ID: "a", Kind: "text", ZIndex: 3, Visible: true},
		{ID: "c", Kind: "shape", ZIndex: 1, Visible: true},
		{ID: "d", Kind: "text", ZIndex: 2, Visible: false},
	}
	sorted := SortLayersByZIndex(layers)
	if len(sorted) != 2 {
		t.Fatalf("expected 2 layers, got %d", len(sorted))
	}
	if sorted[0].ID != "c" || sorted[1].ID != "a" {
		t.Fatalf("unexpected order: %+v", sorted)
	}
}

func TestParseEditorLayer_drawPaths(t *testing.T) {
	raw := map[string]interface{}{
		"id": "d1", "kind": "draw", "width": 0.2, "height": 0.2,
		"paths": []interface{}{
			map[string]interface{}{
				"stroke": "#fff",
				"width":  4.0,
				"points": []interface{}{
					[]interface{}{0.0, 0.0},
					[]interface{}{1.0, 1.0},
				},
			},
		},
	}
	layer, err := ParseEditorLayer(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layer.Paths) != 1 || len(layer.Paths[0].Points) != 2 {
		t.Fatalf("unexpected paths: %+v", layer.Paths)
	}
}

func TestParseEditorLayer_arrowEnds(t *testing.T) {
	raw := map[string]interface{}{
		"id": "a1", "kind": "shape", "shape": "arrow",
		"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1,
		"x1": 0.12, "y1": 0.25, "x2": 0.35, "y2": 0.28,
		"stroke": "#ff0000", "strokeWidth": 6.0,
	}
	layer, err := ParseEditorLayer(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !layer.HasArrowEnds {
		t.Fatal("expected HasArrowEnds")
	}
	if layer.X1 != 0.12 || layer.Y1 != 0.25 || layer.X2 != 0.35 || layer.Y2 != 0.28 {
		t.Fatalf("unexpected ends: %+v", layer)
	}

	legacy := map[string]interface{}{
		"id": "a2", "kind": "shape", "shape": "arrow",
		"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1,
	}
	legacyLayer, err := ParseEditorLayer(legacy)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if legacyLayer.HasArrowEnds {
		t.Fatal("legacy arrow should not have HasArrowEnds")
	}
}

func TestParseEditorLayer_audio(t *testing.T) {
	layer, err := ParseEditorLayer(map[string]interface{}{
		"id": "audio-1",
		"kind": "audio",
		"start": 2.0,
		"end": 8.0,
		"volume": 150.0,
		"fileId": 4.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layer.Volume != 150 || layer.Start != 2 || layer.End != 8 {
		t.Fatalf("unexpected audio layer: %+v", layer)
	}

	defaultVolume, err := ParseEditorLayer(map[string]interface{}{
		"id": "audio-2",
		"kind": "audio",
		"start": 0.0,
		"end": 3.0,
	})
	if err != nil {
		t.Fatalf("unexpected error for default volume: %v", err)
	}
	if defaultVolume.Volume != 100 {
		t.Fatalf("expected default volume 100, got %v", defaultVolume.Volume)
	}
}

func TestParseEditorLayer_audioRejectsInvalidTimingAndVolume(t *testing.T) {
	tests := []map[string]interface{}{
		{"id": "bad-time", "kind": "audio", "start": -1.0, "end": 2.0},
		{"id": "bad-range", "kind": "audio", "start": 2.0, "end": 2.0},
		{"id": "bad-start-type", "kind": "audio", "start": "0", "end": 2.0},
		{"id": "bad-volume-low", "kind": "audio", "start": 0.0, "end": 2.0, "volume": -1.0},
		{"id": "bad-volume-type", "kind": "audio", "start": 0.0, "end": 2.0, "volume": "100"},
		{"id": "bad-volume-high", "kind": "audio", "start": 0.0, "end": 2.0, "volume": 201.0},
	}
	for _, raw := range tests {
		if _, err := ParseEditorLayer(raw); err == nil {
			t.Errorf("expected invalid audio layer to fail: %#v", raw)
		}
	}
}
