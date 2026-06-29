package FfmpegService

import (
	"app/structs"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type ffprobeOutput struct {
	Format struct {
		Duration   string `json:"duration"`
		BitRate    string `json:"bit_rate"`
		FormatName string `json:"format_name"`
	} `json:"format"`
	Streams []struct {
		CodecType  string `json:"codec_type"`
		CodecName  string `json:"codec_name"`
		Width      int    `json:"width"`
		Height     int    `json:"height"`
		RFrameRate string `json:"r_frame_rate"`
	} `json:"streams"`
}

func ProbeMedia(ctx context.Context, path string) (structs.MediaProbeDto, error) {
	if err := validateInputFile(path); err != nil {
		return structs.MediaProbeDto{}, err
	}

	output, err := runCommand(ctx, "ffprobe",
		"-v", "quiet",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		path,
	)
	if err != nil {
		return structs.MediaProbeDto{}, fmt.Errorf("probe media %q: %w", path, err)
	}

	var probe ffprobeOutput
	if err := json.Unmarshal(output, &probe); err != nil {
		return structs.MediaProbeDto{}, fmt.Errorf("parse ffprobe output: %w", err)
	}

	result := structs.MediaProbeDto{
		Format: probe.Format.FormatName,
	}

	if probe.Format.Duration != "" {
		duration, err := strconv.ParseFloat(probe.Format.Duration, 64)
		if err != nil {
			return structs.MediaProbeDto{}, fmt.Errorf("parse duration: %w", err)
		}
		result.Duration = duration
	}

	if probe.Format.BitRate != "" {
		bitrate, err := strconv.ParseInt(probe.Format.BitRate, 10, 64)
		if err != nil {
			return structs.MediaProbeDto{}, fmt.Errorf("parse bitrate: %w", err)
		}
		result.Bitrate = bitrate
	}

	for _, stream := range probe.Streams {
		switch stream.CodecType {
		case "video":
			result.VideoCodec = stream.CodecName
			result.Width = stream.Width
			result.Height = stream.Height
			if stream.RFrameRate != "" {
				fps, err := parseFrameRate(stream.RFrameRate)
				if err != nil {
					return structs.MediaProbeDto{}, fmt.Errorf("parse fps: %w", err)
				}
				result.FPS = fps
			}
		case "audio":
			result.AudioCodec = stream.CodecName
		}
	}

	return result, nil
}

func GetDuration(ctx context.Context, path string) (float64, error) {
	probe, err := ProbeMedia(ctx, path)
	if err != nil {
		return 0, err
	}
	return probe.Duration, nil
}

func BuildEncodeArgs(opts structs.FfmpegEncodeOptionsDto) []string {
	return opts.BuildArgs()
}

func EncodeSegment(
	ctx context.Context,
	input string,
	output string,
	startAt float64,
	sizeLimit int64,
	timeLimit float64,
	opts structs.FfmpegEncodeOptionsDto,
) (structs.SegmentResultDto, error) {
	if err := validateInputFile(input); err != nil {
		return structs.SegmentResultDto{}, err
	}

	outputDir := filepath.Dir(output)
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("create output dir: %w", err)
	}

	args := []string{"-y"}
	if startAt > 0 {
		args = append(args, "-ss", formatSeconds(startAt))
	}
	args = append(args, "-i", input)
	if sizeLimit > 0 {
		args = append(args, "-fs", strconv.FormatInt(sizeLimit, 10))
	}
	if timeLimit > 0 {
		args = append(args, "-t", formatSeconds(timeLimit))
	}
	args = append(args, BuildEncodeArgs(opts)...)
	args = append(args, output)

	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("encode segment: %w", err)
	}

	duration, err := GetDuration(ctx, output)
	if err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("probe encoded segment: %w", err)
	}
	if int(duration) <= 0 {
		return structs.SegmentResultDto{}, fmt.Errorf("encoded segment has zero duration: %s", output)
	}

	stat, err := os.Stat(output)
	if err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("stat output file: %w", err)
	}

	return structs.SegmentResultDto{
		Path:     output,
		Duration: duration,
		Size:     stat.Size(),
		StartAt:  startAt,
	}, nil
}

func SplitBySize(ctx context.Context, opts structs.SplitBySizeOptionsDto) ([]structs.SegmentResultDto, error) {
	if err := validateInputFile(opts.InputPath); err != nil {
		return nil, err
	}
	if opts.SizeLimit <= 0 {
		return nil, fmt.Errorf("size limit must be greater than 0")
	}
	if opts.OutputDir == "" {
		return nil, fmt.Errorf("output dir is required")
	}

	outputExt := opts.OutputExt
	if outputExt == "" {
		outputExt = "mp4"
	}
	namePrefix := opts.NamePrefix
	if namePrefix == "" {
		namePrefix = "video"
	}

	if err := os.MkdirAll(opts.OutputDir, 0o755); err != nil {
		return nil, fmt.Errorf("create output dir: %w", err)
	}

	totalDuration, err := GetDuration(ctx, opts.InputPath)
	if err != nil {
		return nil, fmt.Errorf("get input duration: %w", err)
	}
	if totalDuration <= 0 {
		return nil, fmt.Errorf("input video has zero duration: %s", opts.InputPath)
	}

	var results []structs.SegmentResultDto
	curDuration := 0.0
	maxIterations := int(math.Ceil(totalDuration)) + 1000

	for i := 1; int(curDuration) < int(totalDuration) && i <= maxIterations; i++ {
		output := filepath.Join(opts.OutputDir, fmt.Sprintf("%s-%d.%s", namePrefix, i, outputExt))

		seg, err := EncodeSegment(ctx, opts.InputPath, output, curDuration, opts.SizeLimit, 0, opts.Encode)
		if err != nil {
			return nil, fmt.Errorf("encode part %d: %w", i, err)
		}

		seg.Index = i
		results = append(results, seg)

		nextDuration := curDuration + seg.Duration
		if opts.OnProgress != nil {
			opts.OnProgress(seg, float64(int(totalDuration)), float64(int(nextDuration)))
		}

		if int(nextDuration) >= int(totalDuration) {
			curDuration = nextDuration
			break
		}
		if nextDuration <= curDuration {
			return nil, fmt.Errorf("split stalled at part %d", i)
		}
		curDuration = nextDuration
	}

	if int(curDuration) < int(totalDuration) {
		return nil, fmt.Errorf("split incomplete: encoded %.2fs of %.2fs", curDuration, totalDuration)
	}

	return results, nil
}

func SplitByTime(ctx context.Context, opts structs.SplitByTimeOptionsDto) ([]structs.SegmentResultDto, error) {
	if err := validateInputFile(opts.InputPath); err != nil {
		return nil, err
	}
	if opts.TimeLimit <= 0 {
		return nil, fmt.Errorf("time limit must be greater than 0")
	}
	if opts.OutputDir == "" {
		return nil, fmt.Errorf("output dir is required")
	}

	outputExt := opts.OutputExt
	if outputExt == "" {
		outputExt = "mp4"
	}
	namePrefix := opts.NamePrefix
	if namePrefix == "" {
		namePrefix = "video"
	}

	if err := os.MkdirAll(opts.OutputDir, 0o755); err != nil {
		return nil, fmt.Errorf("create output dir: %w", err)
	}

	totalDuration, err := GetDuration(ctx, opts.InputPath)
	if err != nil {
		return nil, fmt.Errorf("get input duration: %w", err)
	}
	if totalDuration <= 0 {
		return nil, fmt.Errorf("input video has zero duration: %s", opts.InputPath)
	}

	var results []structs.SegmentResultDto
	curDuration := 0.0
	maxIterations := int(math.Ceil(totalDuration/opts.TimeLimit)) + 1

	for i := 1; curDuration < totalDuration && i <= maxIterations; i++ {
		segDuration := opts.TimeLimit
		remaining := totalDuration - curDuration
		if segDuration > remaining {
			segDuration = remaining
		}

		output := filepath.Join(opts.OutputDir, fmt.Sprintf("%s-%d.%s", namePrefix, i, outputExt))
		seg, err := EncodeSegment(ctx, opts.InputPath, output, curDuration, 0, segDuration, opts.Encode)
		if err != nil {
			return nil, fmt.Errorf("encode part %d: %w", i, err)
		}

		seg.Index = i
		results = append(results, seg)

		nextDuration := curDuration + seg.Duration
		if opts.OnProgress != nil {
			opts.OnProgress(seg, totalDuration, nextDuration)
		}

		if nextDuration >= totalDuration {
			break
		}
		if nextDuration <= curDuration {
			return nil, fmt.Errorf("split stalled at part %d", i)
		}
		curDuration = nextDuration
	}

	if curDuration < totalDuration {
		return nil, fmt.Errorf("split incomplete: encoded %.2fs of %.2fs", curDuration, totalDuration)
	}

	return results, nil
}

func validateInputFile(path string) error {
	if path == "" {
		return fmt.Errorf("input path is required")
	}
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("input file %q: %w", path, err)
	}
	if info.IsDir() {
		return fmt.Errorf("input path is a directory: %s", path)
	}
	return nil
}

func parseFrameRate(value string) (float64, error) {
	parts := strings.Split(value, "/")
	if len(parts) != 2 {
		return 0, fmt.Errorf("invalid frame rate: %s", value)
	}

	num, err := strconv.ParseFloat(parts[0], 64)
	if err != nil {
		return 0, err
	}
	den, err := strconv.ParseFloat(parts[1], 64)
	if err != nil {
		return 0, err
	}
	if den == 0 {
		return 0, fmt.Errorf("invalid frame rate denominator: %s", value)
	}

	return num / den, nil
}

func formatSeconds(seconds float64) string {
	return strconv.FormatFloat(seconds, 'f', 3, 64)
}
