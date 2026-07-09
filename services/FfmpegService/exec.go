package FfmpegService

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func runCommand(ctx context.Context, name string, args ...string) ([]byte, error) {
	if name == "ffmpeg" {
		args = prependFFmpegThreadArgs(args)
	}

	cmd := exec.CommandContext(ctx, name, args...)
	var stderr bytes.Buffer

	logFile, closeLog := openCommandLog(name, args...)
	if closeLog != nil {
		defer closeLog()
	}

	var stderrWriter io.Writer = &stderr
	if logFile != nil {
		_, _ = fmt.Fprintf(logFile, "started: %s\ncommand: %s\n\n", time.Now().Format(time.RFC3339), formatCommandLine(name, args))
		stderrWriter = io.MultiWriter(&stderr, logFile)
	}
	cmd.Stderr = stderrWriter

	output, err := cmd.Output()
	if logFile != nil {
		if err != nil {
			_, _ = fmt.Fprintf(logFile, "\nexit error: %v\n", err)
		} else {
			_, _ = fmt.Fprintln(logFile, "\nexit: 0")
		}
	}

	if err != nil {
		if stderr.Len() > 0 {
			return output, fmt.Errorf("%s: %w: %s", name, err, stderr.String())
		}
		return output, fmt.Errorf("%s: %w", name, err)
	}

	return output, nil
}

func openCommandLog(name string, args ...string) (io.Writer, func()) {
	if name != "ffmpeg" {
		return nil, nil
	}

	outputPath := inferOutputPath(args)
	if outputPath == "" {
		return nil, nil
	}

	logPath := commandLogPath(outputPath, name)
	if logPath == "" {
		return nil, nil
	}

	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return nil, nil
	}

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, nil
	}

	return logFile, func() { _ = logFile.Close() }
}

func commandLogPath(outputPath, command string) string {
	dir := filepath.Dir(outputPath)
	if dir == "" || dir == "." {
		return ""
	}

	base := filepath.Base(outputPath)
	ext := filepath.Ext(base)
	nameWithoutExt := strings.TrimSuffix(base, ext)
	if nameWithoutExt == "" {
		nameWithoutExt = base
	}

	return filepath.Join(dir, nameWithoutExt+"."+command+".log")
}

func inferOutputPath(args []string) string {
	var last string
	skipNext := false

	for i, arg := range args {
		if skipNext {
			skipNext = false
			continue
		}

		if strings.HasPrefix(arg, "-") {
			if ffmpegFlagTakesArgument(arg) && i+1 < len(args) {
				skipNext = true
			}
			continue
		}

		last = arg
	}

	return last
}

func ffmpegFlagTakesArgument(flag string) bool {
	if strings.Contains(flag, "=") {
		return false
	}

	switch flag {
	case "-y", "-n", "-an", "-vn", "-sn", "-dn", "-nostdin":
		return false
	default:
		return true
	}
}

func formatCommandLine(name string, args []string) string {
	parts := []string{name}
	for _, arg := range args {
		if strings.ContainsAny(arg, " \t'\"") {
			parts = append(parts, fmt.Sprintf("%q", arg))
			continue
		}
		parts = append(parts, arg)
	}
	return strings.Join(parts, " ")
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
