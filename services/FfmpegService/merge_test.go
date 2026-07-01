package FfmpegService

import (
	"app/structs"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestCanConcatCopy_compatibleClips(t *testing.T) {
	probes := []structs.MediaProbeDto{
		{VideoCodec: "h264", AudioCodec: "aac", Width: 1920, Height: 1080, FPS: 30},
		{VideoCodec: "h264", AudioCodec: "aac", Width: 1920, Height: 1080, FPS: 30},
	}
	encode := structs.FfmpegEncodeOptionsDto{VideoCodec: "copy", AudioCodec: "copy"}
	if !CanConcatCopy(probes, encode) {
		t.Fatal("expected compatible clips to allow concat copy")
	}
}

func TestEncodeArgsForMergeFilter_noCopyCodecs(t *testing.T) {
	args := encodeArgsForMergeFilter(structs.FfmpegEncodeOptionsDto{
		VideoCodec: "copy",
		AudioCodec: "copy",
		Scale:      "1080:-2",
	})
	for i := 0; i < len(args)-1; i++ {
		if args[i] == "-c:v" && args[i+1] == "copy" {
			t.Fatal("filter_complex merge must not use -c:v copy")
		}
		if args[i] == "-c:a" && args[i+1] == "copy" {
			t.Fatal("filter_complex merge must not use -c:a copy")
		}
		if args[i] == "-vf" {
			t.Fatal("scale must be applied in filter_complex, not -vf")
		}
	}
}

func TestCanConcatCopy_resolutionMismatch(t *testing.T) {
	probes := []structs.MediaProbeDto{
		{VideoCodec: "h264", AudioCodec: "aac", Width: 1920, Height: 1080, FPS: 30},
		{VideoCodec: "h264", AudioCodec: "aac", Width: 1280, Height: 720, FPS: 30},
	}
	encode := structs.FfmpegEncodeOptionsDto{VideoCodec: "copy", AudioCodec: "copy"}
	if CanConcatCopy(probes, encode) {
		t.Fatal("expected resolution mismatch to disallow concat copy")
	}
}

func TestMergeVideos_integration(t *testing.T) {
	if os.Getenv("FFMPEG_INTEGRATION") == "" {
		t.Skip("set FFMPEG_INTEGRATION=1 to run ffmpeg merge integration test")
	}

	ctx := context.Background()
	if err := CheckFFmpeg(ctx); err != nil {
		t.Skip(err)
	}

	dir := t.TempDir()
	input1 := filepath.Join(dir, "a.mp4")
	input2 := filepath.Join(dir, "b.mp4")
	output := filepath.Join(dir, "merged.mp4")

	for _, path := range []string{input1, input2} {
		_, err := runCommand(ctx, "ffmpeg",
			"-y",
			"-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=30",
			"-f", "lavfi", "-i", "sine=frequency=440:duration=1",
			"-shortest",
			"-pix_fmt", "yuv420p",
			"-c:v", "libx264",
			"-c:a", "aac",
			path,
		)
		if err != nil {
			t.Fatalf("create test clip: %v", err)
		}
	}

	result, err := MergeVideos(ctx, structs.MergeOptionsDto{
		Inputs:     []string{input1, input2},
		OutputPath: output,
		OutputExt:  "mp4",
		Encode: structs.FfmpegEncodeOptionsDto{
			VideoCodec:  "copy",
			AudioCodec:  "copy",
			PixelFormat: "yuv420p",
		},
	})
	if err != nil {
		t.Fatalf("merge videos: %v", err)
	}
	if result.Duration <= 0 {
		t.Fatalf("expected positive duration, got %v", result.Duration)
	}
	if _, err := os.Stat(output); err != nil {
		t.Fatalf("output file missing: %v", err)
	}
}
