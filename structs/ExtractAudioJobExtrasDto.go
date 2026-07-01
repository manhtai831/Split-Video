package structs

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

type ExtractAudioMetadataDto struct {
	Title   string `json:"title,omitempty"`
	Artist  string `json:"artist,omitempty"`
	Album   string `json:"album,omitempty"`
	Year    string `json:"year,omitempty"`
	Comment string `json:"comment,omitempty"`
}

type ExtractAudioJobExtrasDto struct {
	OutputFormat string                  `json:"output_format"`
	AudioBitrate string                  `json:"audio_bitrate"`
	Volume       float64                 `json:"volume"`
	Speed        float64                 `json:"speed"`
	Metadata     ExtractAudioMetadataDto `json:"metadata,omitempty"`
}

var allowedExtractFormats = map[string]bool{
	"mp3": true, "m4a": true, "wav": true, "flac": true, "ogg": true,
}

var allowedExtractBitrates = map[string]bool{
	"original": true,
	"64k": true, "96k": true, "128k": true, "192k": true, "256k": true, "320k": true,
}

var allowedExtractSpeeds = map[float64]bool{
	0.5: true, 0.75: true, 1: true, 1.25: true, 1.5: true, 2: true,
}

var metaYearPattern = regexp.MustCompile(`^\d{4}$`)

func ParseExtractAudioForm(fields map[string]string) (ExtractAudioJobExtrasDto, error) {
	outputFormat := fields["output_format"]
	if outputFormat == "" {
		outputFormat = "mp3"
	}
	if !allowedExtractFormats[outputFormat] {
		return ExtractAudioJobExtrasDto{}, fmt.Errorf("invalid output_format: %q", outputFormat)
	}

	audioBitrate := fields["audio_bitrate"]
	if audioBitrate == "" {
		audioBitrate = "original"
	}
	if !allowedExtractBitrates[audioBitrate] {
		return ExtractAudioJobExtrasDto{}, fmt.Errorf("invalid audio_bitrate: %q", audioBitrate)
	}

	volume, err := parseExtractVolume(fields["volume"])
	if err != nil {
		return ExtractAudioJobExtrasDto{}, err
	}

	speed, err := parseExtractSpeed(fields["speed"])
	if err != nil {
		return ExtractAudioJobExtrasDto{}, err
	}

	meta, err := parseExtractMetadata(fields)
	if err != nil {
		return ExtractAudioJobExtrasDto{}, err
	}

	return ExtractAudioJobExtrasDto{
		OutputFormat: outputFormat,
		AudioBitrate: audioBitrate,
		Volume:       volume,
		Speed:        speed,
		Metadata:     meta,
	}, nil
}

func parseExtractVolume(raw string) (float64, error) {
	if raw == "" {
		return 100, nil
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid volume: %q", raw)
	}
	if v < 0 || v > 200 {
		return 0, fmt.Errorf("volume must be between 0 and 200, got %v", v)
	}
	return v, nil
}

func parseExtractSpeed(raw string) (float64, error) {
	if raw == "" {
		return 1, nil
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid speed: %q", raw)
	}
	if !allowedExtractSpeeds[v] {
		return 0, fmt.Errorf("invalid speed: %v", v)
	}
	return v, nil
}

func parseExtractMetadata(fields map[string]string) (ExtractAudioMetadataDto, error) {
	year := strings.TrimSpace(fields["meta_year"])
	if year != "" && !metaYearPattern.MatchString(year) {
		return ExtractAudioMetadataDto{}, fmt.Errorf("invalid meta_year: %q", year)
	}

	return ExtractAudioMetadataDto{
		Artist:  sanitizeMetadataField(fields["meta_artist"]),
		Album:   sanitizeMetadataField(fields["meta_album"]),
		Year:    year,
		Comment: sanitizeMetadataField(fields["meta_comment"]),
	}, nil
}

func sanitizeMetadataField(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range raw {
		if unicode.IsControl(r) {
			continue
		}
		b.WriteRune(r)
	}
	s := b.String()
	if len(s) > 500 {
		return s[:500]
	}
	return s
}

func (d ExtractAudioJobExtrasDto) ToJSON() (string, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ParseExtractAudioJobExtrasJSON(raw string) (ExtractAudioJobExtrasDto, error) {
	if raw == "" {
		return ExtractAudioJobExtrasDto{}, fmt.Errorf("empty extras")
	}
	var extras ExtractAudioJobExtrasDto
	if err := json.Unmarshal([]byte(raw), &extras); err != nil {
		return ExtractAudioJobExtrasDto{}, err
	}
	var fields map[string]json.RawMessage
	_ = json.Unmarshal([]byte(raw), &fields)
	if extras.OutputFormat == "" {
		extras.OutputFormat = "mp3"
	}
	if extras.AudioBitrate == "" {
		extras.AudioBitrate = "original"
	}
	if _, ok := fields["volume"]; !ok {
		extras.Volume = 100
	}
	if extras.Speed == 0 {
		extras.Speed = 1
	}
	return extras, nil
}

func (d ExtractAudioJobExtrasDto) NeedsReencode() bool {
	return d.Volume != 100 || d.Speed != 1
}
