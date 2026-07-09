package FfmpegService

import (
	"runtime"
	"testing"
)

func TestFfmpegMaxThreads_envOverride(t *testing.T) {
	t.Setenv("FFMPEG_MAX_THREADS", "4")
	if got := ffmpegMaxThreads(); got != 4 {
		t.Fatalf("ffmpegMaxThreads() = %d, want 4", got)
	}
}

func TestFfmpegMaxThreads_invalidEnvFallsBack(t *testing.T) {
	tests := []string{"0", "abc", "-1"}
	for _, raw := range tests {
		t.Run(raw, func(t *testing.T) {
			t.Setenv("FFMPEG_MAX_THREADS", raw)
			got := ffmpegMaxThreads()
			want := int(float64(runtime.NumCPU()) * 0.8)
			if want < 1 {
				want = 1
			}
			if got != want {
				t.Fatalf("ffmpegMaxThreads() = %d, want %d", got, want)
			}
		})
	}
}

func TestPrependFFmpegThreadArgs_addsWhenMissing(t *testing.T) {
	t.Setenv("FFMPEG_MAX_THREADS", "2")

	got := prependFFmpegThreadArgs([]string{"-y", "-i", "in.mp4", "out.mp4"})
	if len(got) < 2 || got[0] != "-threads" || got[1] != "2" {
		t.Fatalf("prependFFmpegThreadArgs() = %v, want -threads 2 prefix", got)
	}
	if got[2] != "-y" {
		t.Fatalf("prependFFmpegThreadArgs() preserved args = %v", got[2:])
	}
}

func TestPrependFFmpegThreadArgs_skipsWhenPresent(t *testing.T) {
	t.Setenv("FFMPEG_MAX_THREADS", "8")

	original := []string{"-y", "-threads", "2", "-i", "in.mp4", "out.mp4"}
	got := prependFFmpegThreadArgs(original)
	if len(got) != len(original) {
		t.Fatalf("prependFFmpegThreadArgs() len = %d, want %d", len(got), len(original))
	}
	for i := range original {
		if got[i] != original[i] {
			t.Fatalf("prependFFmpegThreadArgs() = %v, want %v", got, original)
		}
	}
}

func TestArgsContainsFFmpegFlag_threads(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want bool
	}{
		{
			name: "separate value",
			args: []string{"-y", "-threads", "2", "-i", "in.mp4"},
			want: true,
		},
		{
			name: "equals form",
			args: []string{"-y", "-threads=4", "-i", "in.mp4"},
			want: true,
		},
		{
			name: "missing",
			args: []string{"-y", "-i", "in.mp4"},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := argsContainsFFmpegFlag(tt.args, "-threads"); got != tt.want {
				t.Fatalf("argsContainsFFmpegFlag() = %v, want %v", got, tt.want)
			}
		})
	}
}
