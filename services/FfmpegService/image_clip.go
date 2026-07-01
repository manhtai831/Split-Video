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

func IsImageFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif":
		return true
	default:
		return false
	}
}

type ImageClipOptions struct {
	InputPath    string
	OutputPath   string
	Kind         string
	HoldDuration float64
	Encode       structs.FfmpegEncodeOptionsDto
	CanvasW      int
	CanvasH      int
}

func ImageToVideoClip(ctx context.Context, opts ImageClipOptions) error {
	if err := validateInputFile(opts.InputPath); err != nil {
		return err
	}
	if opts.OutputPath == "" {
		return fmt.Errorf("output path is required")
	}
	if opts.Kind != "image" && opts.Kind != "gif" {
		return fmt.Errorf("invalid kind %q for image clip", opts.Kind)
	}

	canvasW, canvasH := opts.CanvasW, opts.CanvasH
	if canvasW <= 0 || canvasH <= 0 {
		probe, err := ProbeMedia(ctx, opts.InputPath)
		if err != nil {
			return fmt.Errorf("probe image: %w", err)
		}
		canvasW, canvasH = computeMergeCanvas([]structs.MediaProbeDto{probe}, opts.Encode.Scale)
	}
	if canvasW <= 0 || canvasH <= 0 {
		return fmt.Errorf("could not determine canvas for image clip")
	}

	fps := opts.Encode.FPS
	if fps <= 0 {
		fps = 30
	}

	if err := os.MkdirAll(filepath.Dir(opts.OutputPath), 0o755); err != nil {
		return fmt.Errorf("create output dir: %w", err)
	}

	filter := mergeVideoFilter(canvasW, canvasH)
	args := []string{"-y"}

	useLoop := opts.Kind == "image" || (opts.Kind == "gif" && opts.HoldDuration > 0)
	if useLoop {
		args = append(args, "-loop", "1")
	}
	args = append(args, "-i", opts.InputPath)

	if opts.Kind == "image" {
		duration := opts.HoldDuration
		if duration <= 0 {
			duration = 2
		}
		args = append(args, "-t", formatSeconds(duration))
	} else if opts.HoldDuration > 0 {
		args = append(args, "-t", formatSeconds(opts.HoldDuration))
	}

	args = append(args, "-vf", filter)
	args = append(args, "-r", strconv.Itoa(fps))
	args = append(args, "-pix_fmt", "yuv420p", "-an", "-c:v", "libx264")
	if opts.Encode.Preset != "" {
		args = append(args, "-preset", opts.Encode.Preset)
	}
	if opts.Encode.CRF > 0 {
		args = append(args, "-crf", strconv.Itoa(opts.Encode.CRF))
	}
	args = append(args, opts.OutputPath)

	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return fmt.Errorf("image to video clip: %w", err)
	}
	return nil
}
