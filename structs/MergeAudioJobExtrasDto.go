package structs

import (
	"encoding/json"
	"fmt"
)

type MergeAudioJobExtrasDto struct {
	OutputFormat string `json:"output_format"`
	AudioBitrate string `json:"audio_bitrate"`
}

var allowedMergeAudioFormats = map[string]bool{
	"mp3": true, "m4a": true, "wav": true, "flac": true, "ogg": true,
}

var allowedMergeAudioBitrates = map[string]bool{
	"original": true,
	"64k":      true,
	"96k":      true,
	"128k":     true,
	"192k":     true,
	"256k":     true,
	"320k":     true,
}

func ParseMergeAudioForm(fields map[string]string) (MergeAudioJobExtrasDto, error) {
	outputFormat := fields["output_format"]
	if outputFormat == "" {
		outputFormat = "mp3"
	}
	if !allowedMergeAudioFormats[outputFormat] {
		return MergeAudioJobExtrasDto{}, fmt.Errorf("invalid output_format: %q", outputFormat)
	}

	audioBitrate := fields["audio_bitrate"]
	if audioBitrate == "" {
		audioBitrate = "original"
	}
	if !allowedMergeAudioBitrates[audioBitrate] {
		return MergeAudioJobExtrasDto{}, fmt.Errorf("invalid audio_bitrate: %q", audioBitrate)
	}

	return MergeAudioJobExtrasDto{
		OutputFormat: outputFormat,
		AudioBitrate: audioBitrate,
	}, nil
}

func (d MergeAudioJobExtrasDto) ToJSON() (string, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ParseMergeAudioJobExtrasJSON(raw string) (MergeAudioJobExtrasDto, error) {
	if raw == "" {
		return MergeAudioJobExtrasDto{}, fmt.Errorf("empty extras")
	}
	var extras MergeAudioJobExtrasDto
	if err := json.Unmarshal([]byte(raw), &extras); err != nil {
		return MergeAudioJobExtrasDto{}, err
	}
	if extras.OutputFormat == "" {
		extras.OutputFormat = "mp3"
	}
	if extras.AudioBitrate == "" {
		extras.AudioBitrate = "original"
	}
	if !allowedMergeAudioFormats[extras.OutputFormat] {
		return MergeAudioJobExtrasDto{}, fmt.Errorf("invalid output_format: %q", extras.OutputFormat)
	}
	if !allowedMergeAudioBitrates[extras.AudioBitrate] {
		return MergeAudioJobExtrasDto{}, fmt.Errorf("invalid audio_bitrate: %q", extras.AudioBitrate)
	}
	return extras, nil
}
