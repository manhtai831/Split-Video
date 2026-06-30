package structs

import (
	"app/enums"
	"encoding/json"
	"fmt"
	"strconv"
)

type SplitJobExtrasDto struct {
	Encode    FfmpegEncodeOptionsDto `json:"encode"`
	SplitMode enums.SplitMode          `json:"split_mode,omitempty"`
	SizeLimit int64                  `json:"size_limit,omitempty"`
	TimeLimit float64                `json:"time_limit,omitempty"`
	OutputExt string                 `json:"output_ext,omitempty"`
}

var allowedSizes = map[string]bool{
	"1080": true, "keep": true, "3840": true, "2560": true,
	"1920": true, "1440": true, "720": true, "480": true,
	"360": true, "240": true,
}

var allowedFPS = map[int]bool{15: true, 24: true, 25: true, 30: true, 60: true}

var allowedPresets = map[string]bool{
	"ultrafast": true, "superfast": true, "veryfast": true,
	"faster": true, "fast": true, "medium": true,
	"slow": true, "slower": true, "veryslow": true,
}

var allowedAudioCodecs = map[string]bool{
	"aac": true, "copy": true, "mute": true,
}

var allowedAudioBitrates = map[string]bool{
	"64k": true, "96k": true, "128k": true, "192k": true, "256k": true,
}

var allowedOutputFormats = map[string]bool{
	"mp4": true, "mov": true, "mkv": true, "avi": true,
	"m4v": true, "webm": true, "flv": true, "ts": true, "m2ts": true, "3gp": true,
}

func ParseSplitForm(fields map[string]string) (SplitJobExtrasDto, error) {
	size := fields["size"]
	if size == "" {
		size = "1080"
	}
	if !allowedSizes[size] {
		return SplitJobExtrasDto{}, fmt.Errorf("invalid size: %q", size)
	}

	audioCodec := fields["audio_codec"]
	if audioCodec == "" {
		if size == "keep" {
			audioCodec = "copy"
		} else {
			audioCodec = "aac"
		}
	}
	if !allowedAudioCodecs[audioCodec] {
		return SplitJobExtrasDto{}, fmt.Errorf("invalid audio_codec: %q", audioCodec)
	}
	if size == "keep" && audioCodec == "aac" {
		return SplitJobExtrasDto{}, fmt.Errorf("audio_codec aac is not allowed with size keep")
	}

	encode := FfmpegEncodeOptionsDto{}

	if size == "keep" {
		encode.VideoCodec = "copy"
	} else {
		encode.VideoCodec = "libx264"
		encode.PixelFormat = "yuv420p"
		encode.Scale = size + ":-2"

		crf, err := parseCRF(fields["crf"], 23)
		if err != nil {
			return SplitJobExtrasDto{}, err
		}
		encode.CRF = crf

		fps, err := parseFPS(fields["fps"])
		if err != nil {
			return SplitJobExtrasDto{}, err
		}
		encode.FPS = fps

		preset := fields["preset"]
		if preset == "" {
			preset = "medium"
		}
		if !allowedPresets[preset] {
			return SplitJobExtrasDto{}, fmt.Errorf("invalid preset: %q", preset)
		}
		encode.Preset = preset
	}

	switch audioCodec {
	case "mute":
		encode.Mute = true
	case "copy":
		encode.AudioCodec = "copy"
	case "aac":
		encode.AudioCodec = "aac"
		bitrate := fields["audio_bitrate"]
		if bitrate == "" {
			bitrate = "128k"
		}
		if !allowedAudioBitrates[bitrate] {
			return SplitJobExtrasDto{}, fmt.Errorf("invalid audio_bitrate: %q", bitrate)
		}
		encode.AudioBitrate = bitrate
	}

	splitMode, err := enums.ParseSplitMode(fields["split_mode"])
	if err != nil {
		return SplitJobExtrasDto{}, err
	}

	var sizeLimit int64
	var timeLimit float64
	switch splitMode {
	case enums.SplitModeTime:
		var err error
		timeLimit, err = parseSplitTime(fields["split_time"], fields["split_time_unit"])
		if err != nil {
			return SplitJobExtrasDto{}, err
		}
	default:
		var err error
		sizeLimit, err = parseSplitSize(fields["split_size"], fields["split_unit"])
		if err != nil {
			return SplitJobExtrasDto{}, err
		}
	}

	outputExt := fields["output_format"]
	if outputExt == "" {
		outputExt = "mp4"
	}
	if !allowedOutputFormats[outputExt] {
		return SplitJobExtrasDto{}, fmt.Errorf("invalid output_format: %q", outputExt)
	}
	applyOutputFormatToEncode(&encode, outputExt)

	return SplitJobExtrasDto{
		Encode:    encode,
		SplitMode: splitMode,
		SizeLimit: sizeLimit,
		TimeLimit: timeLimit,
		OutputExt: outputExt,
	}, nil
}

func parseSplitTime(amount, unit string) (float64, error) {
	if amount == "" || amount == "0" {
		return 0, nil
	}
	n, err := strconv.ParseFloat(amount, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid split_time: %q", amount)
	}
	if n < 0 {
		return 0, fmt.Errorf("split_time must be non-negative, got %v", n)
	}
	if n == 0 {
		return 0, nil
	}

	switch unit {
	case "sec", "":
		return n, nil
	case "min":
		return n * 60, nil
	case "hour":
		return n * 3600, nil
	default:
		return 0, fmt.Errorf("invalid split_time_unit: %q", unit)
	}
}

func parseSplitSize(amount, unit string) (int64, error) {
	if amount == "" || amount == "0" {
		return 0, nil
	}
	n, err := strconv.ParseInt(amount, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid split_size: %q", amount)
	}
	if n < 0 {
		return 0, fmt.Errorf("split_size must be non-negative, got %d", n)
	}
	if n == 0 {
		return 0, nil
	}

	switch unit {
	case "kb":
		return n * 1024, nil
	case "mb", "":
		return n * 1024 * 1024, nil
	case "gb":
		return n * 1024 * 1024 * 1024, nil
	default:
		return 0, fmt.Errorf("invalid split_unit: %q", unit)
	}
}

func parseCRF(raw string, defaultVal int) (int, error) {
	if raw == "" {
		return defaultVal, nil
	}
	crf, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid crf: %q", raw)
	}
	if crf < 18 || crf > 28 {
		return 0, fmt.Errorf("crf must be between 18 and 28, got %d", crf)
	}
	return crf, nil
}

func parseFPS(raw string) (int, error) {
	if raw == "" || raw == "default" {
		return 0, nil
	}
	fps, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid fps: %q", raw)
	}
	if !allowedFPS[fps] {
		return 0, fmt.Errorf("invalid fps: %d", fps)
	}
	return fps, nil
}

func applyOutputFormatToEncode(encode *FfmpegEncodeOptionsDto, outputExt string) {
	if encode.VideoCodec == "copy" {
		return
	}
	switch outputExt {
	case "webm":
		encode.VideoCodec = "libvpx-vp9"
		encode.Preset = ""
		if encode.AudioCodec == "aac" {
			encode.AudioCodec = "libopus"
		}
	}
}

func (d SplitJobExtrasDto) ToJSON() (string, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ParseSplitJobExtrasJSON(raw string) (SplitJobExtrasDto, error) {
	if raw == "" {
		return SplitJobExtrasDto{}, fmt.Errorf("empty extras")
	}
	var extras SplitJobExtrasDto
	if err := json.Unmarshal([]byte(raw), &extras); err != nil {
		return SplitJobExtrasDto{}, err
	}
	extras.SplitMode = extras.SplitMode.OrDefault()
	return extras, nil
}

func DefaultSplitEncodeOptions() FfmpegEncodeOptionsDto {
	return FfmpegEncodeOptionsDto{
		VideoCodec:  "libx264",
		AudioCodec:  "aac",
		PixelFormat: "yuv420p",
	}
}
