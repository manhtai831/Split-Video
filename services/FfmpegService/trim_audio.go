package FfmpegService

import (
	"app/structs"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type TrimAudioOptionsDto struct {
	InputPath        string
	OutputPath       string
	Start            float64
	End              float64
	FadeIn           float64
	FadeOut          float64
	SourceAudioCodec string
	OnProgress       func(float64)
}

func TrimAudio(ctx context.Context, opts TrimAudioOptionsDto) (structs.SegmentResultDto, error) {
	if err := validateInputFile(opts.InputPath); err != nil {
		return structs.SegmentResultDto{}, err
	}
	if opts.End <= opts.Start {
		return structs.SegmentResultDto{}, fmt.Errorf("end must be greater than start")
	}
	segDur := opts.End - opts.Start
	if opts.FadeIn < 0 || opts.FadeOut < 0 {
		return structs.SegmentResultDto{}, fmt.Errorf("fade must be >= 0")
	}
	if opts.FadeIn+opts.FadeOut > segDur {
		return structs.SegmentResultDto{}, fmt.Errorf("fade too long for segment duration")
	}

	if err := os.MkdirAll(filepath.Dir(opts.OutputPath), 0o755); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("create output dir: %w", err)
	}

	if opts.OnProgress != nil {
		opts.OnProgress(0)
	}

	args := buildTrimAudioArgs(opts)
	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("trim audio: %w", err)
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

func buildTrimAudioArgs(opts TrimAudioOptionsDto) []string {
	segDur := opts.End - opts.Start
	args := []string{
		"-y",
		"-ss", formatSeconds(opts.Start),
		"-i", opts.InputPath,
		"-t", formatSeconds(segDur),
		"-vn",
	}

	if opts.FadeIn > 0 || opts.FadeOut > 0 {
		var parts []string
		if opts.FadeIn > 0 {
			parts = append(parts, fmt.Sprintf("afade=t=in:st=0:d=%s", formatSeconds(opts.FadeIn)))
		}
		if opts.FadeOut > 0 {
			fadeOutStart := segDur - opts.FadeOut
			parts = append(parts, fmt.Sprintf(
				"afade=t=out:st=%s:d=%s",
				formatSeconds(fadeOutStart),
				formatSeconds(opts.FadeOut),
			))
		}
		args = append(args, "-af", strings.Join(parts, ","))
		args = append(args, trimAudioCodecArgs(opts.OutputPath)...)
	} else if canCopyTrimAudio(opts) {
		args = append(args, "-c:a", "copy")
	} else {
		args = append(args, trimAudioCodecArgs(opts.OutputPath)...)
	}

	args = append(args, opts.OutputPath)
	return args
}

func canCopyTrimAudio(opts TrimAudioOptionsDto) bool {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(opts.OutputPath), "."))
	codec := strings.ToLower(opts.SourceAudioCodec)
	switch ext {
	case "mp3":
		return codec == "mp3"
	case "m4a", "aac", "mp4":
		return codec == "aac"
	case "ogg", "oga":
		return codec == "vorbis" || codec == "opus"
	case "flac":
		return codec == "flac"
	case "wav":
		return strings.HasPrefix(codec, "pcm_")
	default:
		return false
	}
}

func trimAudioCodecArgs(outputPath string) []string {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(outputPath), "."))
	switch ext {
	case "mp3":
		return []string{"-c:a", "libmp3lame", "-b:a", "192k"}
	case "m4a", "aac", "mp4":
		return []string{"-c:a", "aac", "-b:a", "192k"}
	case "wav":
		return []string{"-c:a", "pcm_s16le"}
	case "flac":
		return []string{"-c:a", "flac"}
	case "ogg", "oga":
		return []string{"-c:a", "libvorbis", "-b:a", "192k"}
	default:
		return []string{"-c:a", "libmp3lame", "-b:a", "192k"}
	}
}
