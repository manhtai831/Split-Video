package FfmpegService

import (
	"os"
	"runtime"
	"strconv"
	"strings"
)

func ffmpegMaxThreads() int {
	if raw := strings.TrimSpace(os.Getenv("FFMPEG_MAX_THREADS")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			return n
		}
	}

	n := int(float64(runtime.NumCPU()) * 0.8)
	if n < 1 {
		return 1
	}
	return n
}

func prependFFmpegThreadArgs(args []string) []string {
	if argsContainsFFmpegFlag(args, "-threads") {
		return args
	}

	n := ffmpegMaxThreads()
	return append([]string{"-threads", strconv.Itoa(n)}, args...)
}

func argsContainsFFmpegFlag(args []string, flag string) bool {
	for _, arg := range args {
		if arg == flag {
			return true
		}
		if strings.HasPrefix(arg, flag+"=") {
			return true
		}
	}
	return false
}
