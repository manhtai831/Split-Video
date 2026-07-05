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
