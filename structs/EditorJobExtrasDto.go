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

type EditorSubtitleDto struct {
	ID        string `json:"id"`
	FileID    int    `json:"fileId,omitempty"`
	ClientKey string `json:"clientKey,omitempty"`
	Name      string `json:"name"`
	MediaURL  string `json:"mediaUrl,omitempty"`
}

type EditorJobExtrasDto struct {
	Name        string                   `json:"name,omitempty"`
	Frame       EditorFrameDto           `json:"frame"`
	FramePreset string                   `json:"framePreset"`
	Duration    float64                  `json:"duration"`
	Layers      []map[string]interface{} `json:"layers"`
	Subtitles   []EditorSubtitleDto      `json:"subtitles,omitempty"`
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
	for i, rawLayer := range dto.Layers {
		if stringField(rawLayer, "kind") != "audio" {
			continue
		}
		if _, err := ParseEditorLayer(rawLayer); err != nil {
			return EditorJobExtrasDto{}, fmt.Errorf("layer %d: %w", i, err)
		}
		if intField(rawLayer, "fileId") < 1 && stringField(rawLayer, "clientKey") == "" {
			return EditorJobExtrasDto{}, fmt.Errorf("invalid editor config: audio layer file is required")
		}
	}
	for i, subtitle := range dto.Subtitles {
		if subtitle.FileID < 1 && strings.TrimSpace(subtitle.ClientKey) == "" {
			return EditorJobExtrasDto{}, fmt.Errorf("invalid editor config: subtitle track %d file is required", i)
		}
		if !IsSupportedSubtitleName(subtitle.Name) {
			return EditorJobExtrasDto{}, fmt.Errorf("invalid editor config: subtitle track %d must be an SRT or VTT file", i)
		}
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

func (d *EditorJobExtrasDto) SanitizeSubtitlesForStorage() {
	for i := range d.Subtitles {
		d.Subtitles[i].ClientKey = ""
	}
}

func (d EditorJobExtrasDto) ValidateResolvedAudioLayerFiles() error {
	for i, layer := range d.Layers {
		if stringField(layer, "kind") == "audio" && intField(layer, "fileId") < 1 {
			return fmt.Errorf("invalid editor config: audio layer %d file upload is missing", i)
		}
	}
	return nil
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

func (d *EditorJobExtrasDto) ResolveSubtitleFiles(identifier string, clientKeyToFileID map[string]int) {
	for i := range d.Subtitles {
		subtitle := &d.Subtitles[i]
		if subtitle.ClientKey != "" {
			if fileID, ok := clientKeyToFileID[subtitle.ClientKey]; ok {
				subtitle.FileID = fileID
				subtitle.MediaURL = fmt.Sprintf("/api/jobs/%s/files/%d/download", identifier, fileID)
			}
			subtitle.ClientKey = ""
		}
	}
}

func (d EditorJobExtrasDto) ValidateResolvedSubtitleFiles() error {
	for i, subtitle := range d.Subtitles {
		if subtitle.FileID < 1 {
			return fmt.Errorf("invalid editor config: subtitle track %d upload is missing", i)
		}
	}
	return nil
}

func IsSupportedSubtitleName(name string) bool {
	ext := strings.ToLower(strings.TrimSpace(name))
	return strings.HasSuffix(ext, ".srt") || strings.HasSuffix(ext, ".vtt")
}
