package FfmpegService

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
)

func runCommand(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	output, err := cmd.Output()
	if err != nil {
		if stderr.Len() > 0 {
			return output, fmt.Errorf("%s: %w: %s", name, err, stderr.String())
		}
		return output, fmt.Errorf("%s: %w", name, err)
	}

	return output, nil
}

func CheckFFmpeg(ctx context.Context) error {
	if _, err := runCommand(ctx, "ffmpeg", "-version"); err != nil {
		return fmt.Errorf("ffmpeg not available: %w", err)
	}
	if _, err := runCommand(ctx, "ffprobe", "-version"); err != nil {
		return fmt.Errorf("ffprobe not available: %w", err)
	}
	return nil
}
