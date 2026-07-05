package structs

import (
	"encoding/json"
	"fmt"
	"strings"
)

type EditorFrameDto struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

type EditorJobExtrasDto struct {
	Frame       EditorFrameDto           `json:"frame"`
	FramePreset string                   `json:"framePreset"`
	Duration    float64                  `json:"duration"`
	Layers      []map[string]interface{} `json:"layers"`
	Encode      FfmpegEncodeOptionsDto   `json:"encode,omitempty"`
	OutputExt   string                   `json:"output_ext,omitempty"`
}

func DefaultEditorEncodeOptions() FfmpegEncodeOptionsDto {
	return FfmpegEncodeOptionsDto{
		VideoCodec:   "libx264",
		AudioCodec:   "aac",
		AudioBitrate: "128k",
		PixelFormat:  "yuv420p",
		CRF:          23,
		Preset:       "medium",
		FPS:          30,
	}
}

func ParseEditorJobExtrasJSON(raw string) (EditorJobExtrasDto, error) {
	if strings.TrimSpace(raw) == "" {
		return EditorJobExtrasDto{}, fmt.Errorf("editor config is empty")
	}

	var dto EditorJobExtrasDto
	if err := json.Unmarshal([]byte(raw), &dto); err != nil {
		return EditorJobExtrasDto{}, fmt.Errorf("invalid editor config JSON: %w", err)
	}

	if dto.Frame.Width < 1 || dto.Frame.Height < 1 {
		return EditorJobExtrasDto{}, fmt.Errorf("frame width and height must be positive")
	}
	if dto.Duration <= 0 {
		return EditorJobExtrasDto{}, fmt.Errorf("duration must be positive")
	}
	if dto.Layers == nil {
		dto.Layers = []map[string]interface{}{}
	}

	return dto, nil
}

func (d EditorJobExtrasDto) ToJSON() (string, error) {
	data, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (d *EditorJobExtrasDto) SanitizeLayersForStorage() {
	for i := range d.Layers {
		layer := d.Layers[i]
		delete(layer, "src")
		delete(layer, "mediaState")
		delete(layer, "clientKey")
		d.Layers[i] = layer
	}
}

func (d *EditorJobExtrasDto) ResolveLayerFiles(identifier string, clientKeyToFileID map[string]int) {
	for i, layer := range d.Layers {
		clientKey, _ := layer["clientKey"].(string)
		if clientKey != "" {
			if fileID, ok := clientKeyToFileID[clientKey]; ok {
				layer["fileId"] = fileID
				layer["mediaUrl"] = fmt.Sprintf("/api/jobs/%s/files/%d/download", identifier, fileID)
			}
			delete(layer, "clientKey")
		}
		delete(layer, "src")
		delete(layer, "mediaState")
		d.Layers[i] = layer
	}
}
