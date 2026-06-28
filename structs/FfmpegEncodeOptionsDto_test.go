package structs

import "testing"

func TestFfmpegEncodeOptionsDto_BuildArgs(t *testing.T) {
	opts := FfmpegEncodeOptionsDto{
		FPS:          30,
		VideoCodec:   "libx264",
		AudioCodec:   "aac",
		CRF:          23,
		VideoBitrate: "2M",
		AudioBitrate: "128k",
		Preset:       "medium",
		PixelFormat:  "yuv420p",
		Scale:        "1280:720",
		ExtraArgs:    []string{"-movflags", "+faststart"},
	}

	args := opts.BuildArgs()

	expected := []string{
		"-c:v", "libx264",
		"-c:a", "aac",
		"-crf", "23",
		"-b:v", "2M",
		"-b:a", "128k",
		"-preset", "medium",
		"-pix_fmt", "yuv420p",
		"-vf", "scale=1280:720",
		"-r", "30",
		"-movflags", "+faststart",
	}

	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d: %v", len(expected), len(args), args)
	}

	for i, arg := range expected {
		if args[i] != arg {
			t.Fatalf("arg %d: expected %q, got %q", i, arg, args[i])
		}
	}
}

func TestFfmpegEncodeOptionsDto_BuildArgsEmpty(t *testing.T) {
	args := FfmpegEncodeOptionsDto{}.BuildArgs()
	if len(args) != 0 {
		t.Fatalf("expected no args, got %v", args)
	}
}

func TestFfmpegEncodeOptionsDto_BuildArgsMute(t *testing.T) {
	opts := FfmpegEncodeOptionsDto{
		VideoCodec: "libx264",
		Mute:       true,
		CRF:        23,
	}

	args := opts.BuildArgs()

	hasAn := false
	hasAudioCodec := false
	for _, arg := range args {
		if arg == "-an" {
			hasAn = true
		}
		if arg == "-c:a" {
			hasAudioCodec = true
		}
	}
	if !hasAn {
		t.Fatalf("expected -an in args, got %v", args)
	}
	if hasAudioCodec {
		t.Fatalf("did not expect -c:a in args, got %v", args)
	}
}
