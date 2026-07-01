package FfmpegService

import (
	"app/structs"
	"context"
	"fmt"
	"os"
	"strconv"
)

func CreateAnimatedImage(ctx context.Context, opts structs.GifOptionsDto) (structs.SegmentResultDto, error) {
	if err := validateInputFile(opts.InputPath); err != nil {
		return structs.SegmentResultDto{}, err
	}
	if opts.Duration <= 0 {
		return structs.SegmentResultDto{}, fmt.Errorf("duration must be positive")
	}
	if opts.Width <= 0 || opts.Height <= 0 {
		return structs.SegmentResultDto{}, fmt.Errorf("invalid dimensions %dx%d", opts.Width, opts.Height)
	}
	if opts.FPS <= 0 {
		opts.FPS = 10
	}

	scale := fmt.Sprintf("scale=%d:%d:flags=lanczos", opts.Width, opts.Height)
	fpsFilter := fmt.Sprintf("fps=%d", opts.FPS)

	var args []string
	args = append(args, "-y", "-ss", formatSeconds(opts.StartAt), "-t", formatSeconds(opts.Duration))
	args = append(args, "-i", opts.InputPath)

	switch opts.OutputFmt {
	case "webp":
		args = append(args, "-an")
		args = append(args, "-vf", fpsFilter+","+scale)
		args = append(args, "-c:v", "libwebp")
		if opts.Quality.Lossless {
			args = append(args, "-lossless", "1")
		} else {
			args = append(args, "-lossless", "0", "-quality", strconv.Itoa(opts.Quality.WebpQuality))
		}
		args = append(args, "-method", "6")
		if opts.Loop {
			args = append(args, "-loop", "0")
		} else {
			args = append(args, "-loop", "1")
		}
	case "apng":
		filter := buildPaletteFilter(fpsFilter, scale, opts.Quality)
		args = append(args, "-an", "-filter_complex", filter)
		args = append(args, "-f", "apng", "-plays", "0")
		if opts.Quality.Compression > 0 {
			args = append(args, "-compression_level", strconv.Itoa(opts.Quality.Compression))
		}
	default:
		filter := buildPaletteFilter(fpsFilter, scale, opts.Quality)
		args = append(args, "-an", "-filter_complex", filter)
		if opts.Loop {
			args = append(args, "-loop", "0")
		} else {
			args = append(args, "-loop", "1")
		}
	}

	args = append(args, opts.OutputPath)

	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("create animated image: %w", err)
	}

	stat, err := os.Stat(opts.OutputPath)
	if err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("stat output: %w", err)
	}

	if opts.OnProgress != nil {
		opts.OnProgress(1)
	}

	return structs.SegmentResultDto{
		Path:     opts.OutputPath,
		Size:     stat.Size(),
		Duration: opts.Duration,
		StartAt:  opts.StartAt,
	}, nil
}

func buildPaletteFilter(fpsFilter, scale string, quality structs.GifQualityParams) string {
	base := fmt.Sprintf("[0:v]%s,%s", fpsFilter, scale)
	maxColors := quality.MaxColors
	if maxColors <= 0 {
		maxColors = 256
	}
	dither := quality.Dither
	if dither == "" {
		dither = "floyd_steinberg"
	}
	if dither == "none" {
		return fmt.Sprintf("%s,split[s0][s1];[s0]palettegen=max_colors=%d:stats_mode=diff[p];[s1][p]paletteuse", base, maxColors)
	}
	return fmt.Sprintf("%s,split[s0][s1];[s0]palettegen=max_colors=%d:stats_mode=diff[p];[s1][p]paletteuse=dither=%s", base, maxColors, dither)
}
