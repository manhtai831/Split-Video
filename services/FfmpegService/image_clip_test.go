package FfmpegService

import (
	"app/structs"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestIsImageFile(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"photo.jpg", true},
		{"photo.JPEG", true},
		{"img.png", true},
		{"img.webp", true},
		{"anim.gif", true},
		{"clip.mp4", false},
		{"clip.mov", false},
	}
	for _, tc := range cases {
		if got := IsImageFile(tc.path); got != tc.want {
			t.Fatalf("IsImageFile(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}

func TestImageToVideoClip_staticImage(t *testing.T) {
	if os.Getenv("FFMPEG_INTEGRATION") == "" {
		t.Skip("set FFMPEG_INTEGRATION=1 to run ffmpeg image clip integration test")
	}

	ctx := context.Background()
	if err := CheckFFmpeg(ctx); err != nil {
		t.Skip(err)
	}

	dir := t.TempDir()
	input := filepath.Join(dir, "frame.png")
	output := filepath.Join(dir, "clip.mp4")

	_, err := runCommand(ctx, "ffmpeg",
		"-y",
		"-f", "lavfi", "-i", "color=c=blue:s=640x480:d=1",
		"-frames:v", "1",
		input,
	)
	if err != nil {
		t.Fatalf("create test image: %v", err)
	}

	err = ImageToVideoClip(ctx, ImageClipOptions{
		InputPath:    input,
		OutputPath:   output,
		Kind:         "image",
		HoldDuration: 2,
		Encode:       structs.FfmpegEncodeOptionsDto{CRF: 23, Preset: "ultrafast"},
		CanvasW:      640,
		CanvasH:      480,
	})
	if err != nil {
		t.Fatalf("ImageToVideoClip: %v", err)
	}

	duration, err := GetDuration(ctx, output)
	if err != nil {
		t.Fatalf("probe output: %v", err)
	}
	if duration < 1.5 || duration > 2.5 {
		t.Fatalf("expected ~2s duration, got %v", duration)
	}
}
