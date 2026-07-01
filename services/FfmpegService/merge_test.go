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

func TestComputeMergeCanvas_sameAspectRatio(t *testing.T) {
	probes := []structs.MediaProbeDto{
		{Width: 1920, Height: 1080},
		{Width: 1280, Height: 720},
	}
	w, h := computeMergeCanvas(probes, "1080:-2")
	if w != 1080 || h != 608 {
		t.Fatalf("expected 1080x608 canvas, got %dx%d", w, h)
	}
}

func TestComputeMergeCanvas_mixedAspectRatio(t *testing.T) {
	probes := []structs.MediaProbeDto{
		{Width: 1920, Height: 1080},
		{Width: 1080, Height: 1920},
	}
	w, h := computeMergeCanvas(probes, "1080:-2")
	if w != 1080 || h != 1920 {
		t.Fatalf("expected 1080x1920 canvas, got %dx%d", w, h)
	}
}

func TestComputeMergeCanvas_originalSizeMaxWidth(t *testing.T) {
	probes := []structs.MediaProbeDto{
		{Width: 1280, Height: 720},
		{Width: 1920, Height: 1080},
	}
	w, h := computeMergeCanvas(probes, "")
	if w != 1920 || h != 1080 {
		t.Fatalf("expected 1920x1080 canvas, got %dx%d", w, h)
	}
}

func TestParseScaleTargetWidth(t *testing.T) {
	if got := parseScaleTargetWidth("1080:-2"); got != 1080 {
		t.Fatalf("expected 1080, got %d", got)
	}
	if got := parseScaleTargetWidth("1280:720"); got != 1280 {
		t.Fatalf("expected 1280, got %d", got)
	}
	if got := parseScaleTargetWidth(""); got != 0 {
		t.Fatalf("expected 0, got %d", got)
	}
}

func TestMergeVideoFilter_withCanvas(t *testing.T) {
	got := mergeVideoFilter(1080, 1920)
	want := "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
	if got != want {
		t.Fatalf("unexpected filter:\n%s", got)
	}
}

func TestMergeVideoFilter_noCanvas(t *testing.T) {
	if got := mergeVideoFilter(0, 0); got != "setsar=1" {
		t.Fatalf("expected setsar=1 fallback, got %q", got)
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
