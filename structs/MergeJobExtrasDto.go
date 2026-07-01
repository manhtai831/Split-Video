package structs

import (
	"encoding/json"
	"fmt"
)

type MergeJobExtrasDto struct {
	Encode    FfmpegEncodeOptionsDto `json:"encode"`
	OutputExt string                 `json:"output_ext,omitempty"`
	ItemsMeta []MergeItemMetaDto     `json:"items_meta,omitempty"`
}

func ParseMergeForm(fields map[string]string) (MergeJobExtrasDto, error) {
	size := fields["size"]
	if size == "" {
		size = "1080"
	}
	if !allowedSizes[size] {
		return MergeJobExtrasDto{}, fmt.Errorf("invalid size: %q", size)
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
		return MergeJobExtrasDto{}, fmt.Errorf("invalid audio_codec: %q", audioCodec)
	}
	if size == "keep" && audioCodec == "aac" {
		return MergeJobExtrasDto{}, fmt.Errorf("audio_codec aac is not allowed with size keep")
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
			return MergeJobExtrasDto{}, err
		}
		encode.CRF = crf

		fps, err := parseFPS(fields["fps"])
		if err != nil {
			return MergeJobExtrasDto{}, err
		}
		encode.FPS = fps

		preset := fields["preset"]
		if preset == "" {
			preset = "medium"
		}
		if !allowedPresets[preset] {
			return MergeJobExtrasDto{}, fmt.Errorf("invalid preset: %q", preset)
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
			return MergeJobExtrasDto{}, fmt.Errorf("invalid audio_bitrate: %q", bitrate)
		}
		encode.AudioBitrate = bitrate
	}

	outputExt := fields["output_format"]
	if outputExt == "" {
		outputExt = "mp4"
	}
	if !allowedOutputFormats[outputExt] {
		return MergeJobExtrasDto{}, fmt.Errorf("invalid output_format: %q", outputExt)
	}
	applyOutputFormatToEncode(&encode, outputExt)

	return MergeJobExtrasDto{
		Encode:    encode,
		OutputExt: outputExt,
	}, nil
}

func (d MergeJobExtrasDto) ToJSON() (string, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ParseMergeJobExtrasJSON(raw string) (MergeJobExtrasDto, error) {
	if raw == "" {
		return MergeJobExtrasDto{}, fmt.Errorf("empty extras")
	}
	var extras MergeJobExtrasDto
	if err := json.Unmarshal([]byte(raw), &extras); err != nil {
		return MergeJobExtrasDto{}, err
	}
	return extras, nil
}

func DefaultMergeEncodeOptions() FfmpegEncodeOptionsDto {
	return FfmpegEncodeOptionsDto{
		VideoCodec:  "libx264",
		AudioCodec:  "aac",
		PixelFormat: "yuv420p",
	}
}
