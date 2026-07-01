package FfmpegService

import (
	"app/structs"
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const maxMergeClips = 200

func CanConcatCopy(probes []structs.MediaProbeDto, encode structs.FfmpegEncodeOptionsDto) bool {
	if encode.VideoCodec != "copy" || encode.Mute {
		return false
	}
	if len(probes) < 2 {
		return false
	}

	ref := probes[0]
	for i := 1; i < len(probes); i++ {
		p := probes[i]
		if p.VideoCodec != ref.VideoCodec || p.Width != ref.Width || p.Height != ref.Height {
			return false
		}
		if !fpsCompatible(p.FPS, ref.FPS) {
			return false
		}
		if (p.AudioCodec == "") != (ref.AudioCodec == "") {
			return false
		}
		if ref.AudioCodec != "" && p.AudioCodec != ref.AudioCodec {
			return false
		}
	}

	if ref.AudioCodec != "" && encode.AudioCodec != "copy" {
		return false
	}

	return true
}

func MergeVideos(ctx context.Context, opts structs.MergeOptionsDto) (structs.SegmentResultDto, error) {
	if len(opts.Inputs) < 2 {
		return structs.SegmentResultDto{}, fmt.Errorf("merge requires at least 2 input files")
	}
	if len(opts.Inputs) > maxMergeClips {
		return structs.SegmentResultDto{}, fmt.Errorf("merge supports at most %d clips", maxMergeClips)
	}
	if opts.OutputPath == "" {
		return structs.SegmentResultDto{}, fmt.Errorf("output path is required")
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
	if CanConcatCopy(probes, opts.Encode) {
		err = mergeConcatCopy(ctx, opts.Inputs, opts.OutputPath)
	} else {
		err = mergeReencode(ctx, opts.Inputs, probes, opts.OutputPath, opts.Encode, opts.OnProgress, totalDuration)
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
		StartAt:  0,
		Index:    1,
	}, nil
}

func mergeConcatCopy(ctx context.Context, inputs []string, output string) error {
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
		"-movflags", "+faststart",
		output,
	}

	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return fmt.Errorf("concat copy merge: %w", err)
	}
	return nil
}

func mergeReencode(
	ctx context.Context,
	inputs []string,
	probes []structs.MediaProbeDto,
	output string,
	encode structs.FfmpegEncodeOptionsDto,
	onProgress func(float64),
	totalDuration float64,
) error {
	n := len(inputs)
	args := []string{"-y"}
	for _, input := range inputs {
		args = append(args, "-i", input)
	}

	canvasW, canvasH := computeMergeCanvas(probes, encode.Scale)

	var filterParts []string
	var concatInputs []string

	for i := range inputs {
		filterParts = append(filterParts, fmt.Sprintf("[%d:v]%s[v%d]", i, mergeVideoFilter(canvasW, canvasH), i))
		concatInputs = append(concatInputs, fmt.Sprintf("[v%d]", i))

		if !encode.Mute {
			if probes[i].AudioCodec != "" {
				filterParts = append(filterParts, fmt.Sprintf("[%d:a]aformat=sample_rates=44100:channel_layouts=stereo[a%d]", i, i))
			} else {
				dur := probes[i].Duration
				if dur <= 0 {
					dur = 1
				}
				filterParts = append(filterParts, fmt.Sprintf("anullsrc=r=44100:cl=stereo:d=%s[a%d]", formatSeconds(dur), i))
			}
			concatInputs = append(concatInputs, fmt.Sprintf("[a%d]", i))
		}
	}

	if encode.Mute {
		filterParts = append(filterParts, fmt.Sprintf("%sconcat=n=%d:v=1:a=0[outv]", strings.Join(concatInputs, ""), n))
	} else {
		filterParts = append(filterParts, fmt.Sprintf("%sconcat=n=%d:v=1:a=1[outv][outa]", strings.Join(concatInputs, ""), n))
	}

	args = append(args, "-filter_complex", strings.Join(filterParts, ";"))
	args = append(args, "-map", "[outv]")
	if !encode.Mute {
		args = append(args, "-map", "[outa]")
	}
	args = append(args, encodeArgsForMergeFilter(encode)...)
	args = append(args, output)

	if onProgress != nil && totalDuration > 0 {
		onProgress(0.1)
	}
	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return fmt.Errorf("re-encode merge: %w", err)
	}
	return nil
}

// encodeArgsForMergeFilter builds ffmpeg output args for filter_complex merge.
// filter_complex always decodes and re-encodes; stream copy (-c copy) is invalid here.
func encodeArgsForMergeFilter(encode structs.FfmpegEncodeOptionsDto) []string {
	enc := encode
	if enc.VideoCodec == "" || enc.VideoCodec == "copy" {
		enc.VideoCodec = "libx264"
		if enc.PixelFormat == "" {
			enc.PixelFormat = "yuv420p"
		}
		if enc.CRF == 0 && enc.VideoBitrate == "" {
			enc.CRF = 23
		}
	}
	if !enc.Mute && (enc.AudioCodec == "" || enc.AudioCodec == "copy") {
		enc.AudioCodec = "aac"
		if enc.AudioBitrate == "" {
			enc.AudioBitrate = "128k"
		}
	}
	// Scaling is applied in filter_complex; -vf would conflict with -map [outv].
	enc.Scale = ""
	return BuildEncodeArgs(enc)
}

func fpsCompatible(a, b float64) bool {
	if a == 0 || b == 0 {
		return true
	}
	return math.Abs(a-b) < 0.5
}

func even(n int) int {
	if n%2 != 0 {
		return n + 1
	}
	return n
}

func scaledHeight(targetW, srcW, srcH int) int {
	if srcW <= 0 || srcH <= 0 {
		return even(targetW)
	}
	return even(int(math.Round(float64(targetW) * float64(srcH) / float64(srcW))))
}

func parseScaleTargetWidth(scale string) int {
	if scale == "" {
		return 0
	}
	idx := strings.Index(scale, ":")
	part := scale
	if idx >= 0 {
		part = scale[:idx]
	}
	w, err := strconv.Atoi(part)
	if err != nil || w <= 0 {
		return 0
	}
	return w
}

func ComputeMergeCanvas(probes []structs.MediaProbeDto, scale string) (int, int) {
	return computeMergeCanvas(probes, scale)
}

func computeMergeCanvas(probes []structs.MediaProbeDto, scale string) (int, int) {
	if len(probes) == 0 {
		return 0, 0
	}

	targetW := parseScaleTargetWidth(scale)
	if targetW <= 0 {
		for _, p := range probes {
			if p.Width > targetW {
				targetW = p.Width
			}
		}
	}
	if targetW <= 0 {
		return 0, 0
	}

	canvasW := even(targetW)
	maxH := 0
	for _, p := range probes {
		h := scaledHeight(targetW, p.Width, p.Height)
		if h > maxH {
			maxH = h
		}
	}
	if maxH <= 0 {
		return 0, 0
	}
	return canvasW, even(maxH)
}

func mergeVideoFilter(canvasW, canvasH int) string {
	if canvasW <= 0 || canvasH <= 0 {
		return "setsar=1"
	}
	return fmt.Sprintf(
		"scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1",
		canvasW, canvasH, canvasW, canvasH,
	)
}
