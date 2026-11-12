package EditorService

import "testing"

func TestValidateAudioLayerUploadRefs(t *testing.T) {
	layer := map[string]interface{}{
		"kind":      "audio",
		"clientKey": "ck-audio",
	}
	if err := validateAudioLayerUploadRefs(
		[]map[string]interface{}{layer},
		[]UploadedFile{{ClientKey: "ck-audio"}},
		nil,
	); err != nil {
		t.Fatalf("unexpected error for uploaded audio layer: %v", err)
	}

	if err := validateAudioLayerUploadRefs(
		[]map[string]interface{}{layer},
		nil,
		nil,
	); err == nil {
		t.Fatal("expected missing audio upload to fail")
	}

	persistedLayer := map[string]interface{}{
		"kind":   "audio",
		"fileId": float64(7),
	}
	if err := validateAudioLayerUploadRefs(
		[]map[string]interface{}{persistedLayer},
		nil,
		map[int]bool{7: true},
	); err != nil {
		t.Fatalf("unexpected error for existing audio file: %v", err)
	}
	if err := validateAudioLayerUploadRefs(
		[]map[string]interface{}{persistedLayer},
		nil,
		map[int]bool{8: true},
	); err == nil {
		t.Fatal("expected audio file from another project to fail")
	}
}
