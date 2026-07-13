package FfmpegService

import (
	"app/structs"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type MergeAudioOptionsDto struct {
	Inputs       []string
	OutputPath   string
	OutputFormat string
	AudioBitrate string
	OnProgress   func(float64)
}

func MergeAudio(ctx context.Context, opts MergeAudioOptionsDto) (structs.SegmentResultDto, error) {
	if len(opts.Inputs) < 2 {
		return structs.SegmentResultDto{}, fmt.Errorf("merge audio requires at least 2 input files")
	}
	if len(opts.Inputs) > maxMergeClips {
		return structs.SegmentResultDto{}, fmt.Errorf("merge audio supports at most %d files", maxMergeClips)
	}
	if opts.OutputPath == "" {
		return structs.SegmentResultDto{}, fmt.Errorf("output path is required")
	}
	if opts.OutputFormat == "" {
		opts.OutputFormat = "mp3"
	}
	if opts.AudioBitrate == "" {
		opts.AudioBitrate = "original"
	}

	for _, input := range opts.Inputs {
		if err := validateInputFile(input); err != nil {
			return structs.SegmentResultDto{}, err
		}
	}

	probes := make([]structs.MediaProbeDto, len(opts.Inputs))
	var totalDuration float64
	for i, input := range opts.Inputs {
		probe, err := ProbeMedia(ctx, input)
		if err != nil {
			return structs.SegmentResultDto{}, fmt.Errorf("probe input %d: %w", i+1, err)
		}
		if probe.AudioCodec == "" {
			return structs.SegmentResultDto{}, fmt.Errorf("input %d has no audio track", i+1)
		}
		probes[i] = probe
		totalDuration += probe.Duration
	}

	if err := os.MkdirAll(filepath.Dir(opts.OutputPath), 0o755); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("create output dir: %w", err)
	}

	if opts.OnProgress != nil {
		opts.OnProgress(0)
	}

	var err error
	if CanConcatCopyAudio(probes, opts.OutputFormat, opts.AudioBitrate) {
		err = mergeAudioConcatCopy(ctx, opts.Inputs, opts.OutputPath)
	} else {
		err = mergeAudioReencode(ctx, opts, probes, totalDuration)
	}
	if err != nil {
		return structs.SegmentResultDto{}, err
	}

	if opts.OnProgress != nil {
		opts.OnProgress(1)
	}

	duration, err := GetDuration(ctx, opts.OutputPath)
	if err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("probe merged output: %w", err)
	}

	stat, err := os.Stat(opts.OutputPath)
	if err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("stat output file: %w", err)
	}

	return structs.SegmentResultDto{
		Path:     opts.OutputPath,
		Duration: duration,
		Size:     stat.Size(),
	}, nil
}

func CanConcatCopyAudio(probes []structs.MediaProbeDto, outputFormat, audioBitrate string) bool {
	if audioBitrate != "" && audioBitrate != "original" {
		return false
	}
	if len(probes) < 2 {
		return false
	}

	ref := probes[0]
	if ref.AudioCodec == "" {
		return false
	}
	if !audioCodecMatchesFormat(ref.AudioCodec, outputFormat) {
		return false
	}

	for i := 1; i < len(probes); i++ {
		p := probes[i]
		if p.AudioCodec == "" || !strings.EqualFold(p.AudioCodec, ref.AudioCodec) {
			return false
		}
	}
	return true
}

func audioCodecMatchesFormat(codec, format string) bool {
	codec = strings.ToLower(codec)
	switch format {
	case "mp3":
		return codec == "mp3"
	case "m4a":
		return codec == "aac"
	case "wav":
		return strings.HasPrefix(codec, "pcm_")
	case "flac":
		return codec == "flac"
	case "ogg":
		return codec == "vorbis" || codec == "opus"
	default:
		return false
	}
}

func mergeAudioConcatCopy(ctx context.Context, inputs []string, output string) error {
	listPath := output + ".concat.txt"
	defer os.Remove(listPath)

	var sb strings.Builder
	for _, input := range inputs {
		absPath, err := filepath.Abs(input)
		if err != nil {
			return fmt.Errorf("resolve input path: %w", err)
		}
		escaped := strings.ReplaceAll(absPath, "'", "'\\''")
		sb.WriteString("file '")
		sb.WriteString(escaped)
		sb.WriteString("'\n")
	}

	if err := os.WriteFile(listPath, []byte(sb.String()), 0o644); err != nil {
		return fmt.Errorf("write concat list: %w", err)
	}

	args := []string{
		"-y",
		"-f", "concat",
		"-safe", "0",
		"-i", listPath,
		"-c", "copy",
		output,
	}

	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return fmt.Errorf("concat copy merge audio: %w", err)
	}
	return nil
}

func mergeAudioReencode(
	ctx context.Context,
	opts MergeAudioOptionsDto,
	probes []structs.MediaProbeDto,
	totalDuration float64,
) error {
	n := len(opts.Inputs)
	args := []string{"-y"}
	for _, input := range opts.Inputs {
		args = append(args, "-i", input)
	}

	var filterParts []string
	var concatInputs []string
	for i := range opts.Inputs {
		filterParts = append(filterParts, fmt.Sprintf(
			"[%d:a]aformat=sample_rates=44100:channel_layouts=stereo[a%d]",
			i, i,
		))
		concatInputs = append(concatInputs, fmt.Sprintf("[a%d]", i))
	}
	filterParts = append(filterParts, fmt.Sprintf(
		"%sconcat=n=%d:v=0:a=1[outa]",
		strings.Join(concatInputs, ""),
		n,
	))

	args = append(args, "-filter_complex", strings.Join(filterParts, ";"))
	args = append(args, "-map", "[outa]")
	args = append(args, mergeAudioCodecArgs(opts, probes[0])...)
	args = append(args, opts.OutputPath)

	if opts.OnProgress != nil && totalDuration > 0 {
		opts.OnProgress(0.1)
	}
	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return fmt.Errorf("re-encode merge audio: %w", err)
	}
	return nil
}

func mergeAudioCodecArgs(opts MergeAudioOptionsDto, probe structs.MediaProbeDto) []string {
	extractOpts := ExtractAudioOptionsDto{
		OutputFormat:       opts.OutputFormat,
		AudioBitrate:       opts.AudioBitrate,
		SourceAudioBitrate: probe.AudioBitrate,
	}
	return audioCodecArgs(extractOpts)
}
