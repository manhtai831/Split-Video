package structs

import "testing"

func TestParseEditorJobExtrasJSON(t *testing.T) {
	raw := `{"frame":{"width":1920,"height":1080},"framePreset":"16:9","duration":30,"layers":[{"id":"layer-1","kind":"text"}]}`
	dto, err := ParseEditorJobExtrasJSON(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dto.Frame.Width != 1920 || dto.Frame.Height != 1080 {
		t.Fatalf("unexpected frame: %+v", dto.Frame)
	}
	if dto.FramePreset != "16:9" {
		t.Fatalf("unexpected preset: %s", dto.FramePreset)
	}
	if len(dto.Layers) != 1 {
		t.Fatalf("expected 1 layer, got %d", len(dto.Layers))
	}
}

func TestEditorJobExtrasSanitizeAndResolve(t *testing.T) {
	dto := EditorJobExtrasDto{
		Frame:       EditorFrameDto{Width: 1080, Height: 1920},
		FramePreset: "9:16",
		Duration:    12,
		Layers: []map[string]interface{}{
			{
				"id":         "layer-1",
				"kind":       "video",
				"clientKey":  "ck-1",
				"src":        "blob:mock",
				"mediaState": "ready",
			},
		},
	}

	dto.ResolveLayerFiles("abc", map[string]int{"ck-1": 42})
	dto.SanitizeLayersForStorage()

	layer := dto.Layers[0]
	if layer["fileId"] != 42 {
		t.Fatalf("expected fileId 42, got %v", layer["fileId"])
	}
	if layer["mediaUrl"] != "/api/jobs/abc/files/42/download" {
		t.Fatalf("unexpected mediaUrl: %v", layer["mediaUrl"])
	}
	if _, ok := layer["src"]; ok {
		t.Fatal("src should be removed")
	}
}
