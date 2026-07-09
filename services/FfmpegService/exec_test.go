package FfmpegService

import "testing"

func TestInferOutputPath(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want string
	}{
		{
			name: "encode segment",
			args: []string{"-y", "-ss", "0.000", "-i", "/in/video.mp4", "-t", "10.000", "-c:v", "libx264", "/out/video-1.mp4"},
			want: "/out/video-1.mp4",
		},
		{
			name: "concat merge",
			args: []string{"-y", "-f", "concat", "-safe", "0", "-i", "/out/list.concat.txt", "-c", "copy", "-movflags", "+faststart", "/out/merged.mp4"},
			want: "/out/merged.mp4",
		},
		{
			name: "filter with equals in value",
			args: []string{"-y", "-i", "/in/video.mp4", "-vf", "scale=1280:720", "/out/video.mp4"},
			want: "/out/video.mp4",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := inferOutputPath(tt.args); got != tt.want {
				t.Fatalf("inferOutputPath() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCommandLogPath(t *testing.T) {
	got := commandLogPath("uploads/output/splits/70/video-1.mp4", "ffmpeg")
	want := "uploads/output/splits/70/video-1.ffmpeg.log"
	if got != want {
		t.Fatalf("commandLogPath() = %q, want %q", got, want)
	}
}
