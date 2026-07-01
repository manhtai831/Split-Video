package FfmpegService

import (
	"app/structs"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type ExtractAudioOptionsDto struct {
	InputPath          string
	OutputPath         string
	OutputFormat       string
	AudioBitrate       string
	Volume             float64
	Speed              float64
	Metadata           structs.ExtractAudioMetadataDto
	SourceAudioCodec   string
	SourceAudioBitrate int64
	OnProgress         func(float64)
}

func ExtractAudio(ctx context.Context, opts ExtractAudioOptionsDto) (structs.SegmentResultDto, error) {
	if err := validateInputFile(opts.InputPath); err != nil {
		return structs.SegmentResultDto{}, err
	}

	if err := os.MkdirAll(filepath.Dir(opts.OutputPath), 0o755); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("create output dir: %w", err)
	}

	if opts.OnProgress != nil {
		opts.OnProgress(0)
	}

	args := buildExtractAudioArgs(opts)
	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("extract audio: %w", err)
	}

	if opts.OnProgress != nil {
		opts.OnProgress(1)
	}

	duration, err := GetDuration(ctx, opts.OutputPath)
	if err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("probe output: %w", err)
	}

	stat, err := os.Stat(opts.OutputPath)
	if err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("stat output: %w", err)
	}

	return structs.SegmentResultDto{
		Path:     opts.OutputPath,
		Duration: duration,
		Size:     stat.Size(),
	}, nil
}

func buildExtractAudioArgs(opts ExtractAudioOptionsDto) []string {
	args := []string{"-y", "-i", opts.InputPath, "-vn"}

	filterChain := buildAudioFilterChain(opts.Volume, opts.Speed)
	if filterChain != "" {
		args = append(args, "-af", filterChain)
	}

	useCopy := canCopyAudioStream(opts)
	if useCopy {
		args = append(args, "-c:a", "copy")
	} else {
		args = append(args, audioCodecArgs(opts)...)
	}

	args = append(args, buildMetadataArgs(opts.Metadata)...)
	args = append(args, opts.OutputPath)
	return args
}

func canCopyAudioStream(opts ExtractAudioOptionsDto) bool {
	if opts.Volume != 100 || opts.Speed != 1 {
		return false
	}
	if opts.AudioBitrate != "original" {
		return false
	}
	switch opts.OutputFormat {
	case "mp3":
		return opts.SourceAudioCodec == "mp3"
	case "m4a":
		return opts.SourceAudioCodec == "aac"
	default:
		return false
	}
}

func audioCodecArgs(opts ExtractAudioOptionsDto) []string {
	var args []string
	switch opts.OutputFormat {
	case "mp3":
		args = append(args, "-c:a", "libmp3lame")
	case "m4a":
		args = append(args, "-c:a", "aac")
	case "wav":
		args = append(args, "-c:a", "pcm_s16le")
	case "flac":
		args = append(args, "-c:a", "flac")
	case "ogg":
		args = append(args, "-c:a", "libvorbis")
	default:
		args = append(args, "-c:a", "libmp3lame")
	}

	if opts.OutputFormat == "wav" || opts.OutputFormat == "flac" {
		return args
	}

	bitrate := resolveAudioBitrate(opts)
	if bitrate != "" {
		args = append(args, "-b:a", bitrate)
	}
	return args
}

func resolveAudioBitrate(opts ExtractAudioOptionsDto) string {
	if opts.AudioBitrate != "" && opts.AudioBitrate != "original" {
		return opts.AudioBitrate
	}
	if opts.SourceAudioBitrate > 0 {
		return formatProbeBitrate(opts.SourceAudioBitrate)
	}
	return "128k"
}

func formatProbeBitrate(bps int64) string {
	kbps := bps / 1000
	if kbps < 64 {
		kbps = 64
	}
	if kbps > 320 {
		kbps = 320
	}
	return strconv.FormatInt(kbps, 10) + "k"
}

func buildAudioFilterChain(volume, speed float64) string {
	var parts []string
	if volume != 100 {
		parts = append(parts, fmt.Sprintf("volume=%s", formatVolumeFactor(volume)))
	}
	if speed != 0 && speed != 1 {
		parts = append(parts, buildAtempoChain(speed))
	}
	return strings.Join(parts, ",")
}

func formatVolumeFactor(volume float64) string {
	return strconv.FormatFloat(volume/100, 'f', 3, 64)
}

func buildAtempoChain(speed float64) string {
	if speed <= 0 {
		return ""
	}
	remaining := speed
	var parts []string
	for remaining < 0.5 || remaining > 2.0 {
		if remaining > 2.0 {
			parts = append(parts, "atempo="+formatAtempoValue(2.0))
			remaining /= 2.0
		} else {
			parts = append(parts, "atempo="+formatAtempoValue(0.5))
			remaining /= 0.5
		}
	}
	parts = append(parts, fmt.Sprintf("atempo=%s", formatAtempoValue(remaining)))
	return strings.Join(parts, ",")
}

func formatAtempoValue(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

func buildMetadataArgs(meta structs.ExtractAudioMetadataDto) []string {
	var args []string
	if meta.Title != "" {
		args = append(args, "-metadata", "title="+meta.Title)
	}
	if meta.Artist != "" {
		args = append(args, "-metadata", "artist="+meta.Artist)
	}
	if meta.Album != "" {
		args = append(args, "-metadata", "album="+meta.Album)
	}
	if meta.Year != "" {
		args = append(args, "-metadata", "date="+meta.Year)
	}
	if meta.Comment != "" {
		args = append(args, "-metadata", "comment="+meta.Comment)
	}
	return args
}
