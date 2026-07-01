package FfmpegService

import (
	"app/structs"
	"strings"
	"testing"
)

func TestBuildExtractAudioArgs_CopyMP3(t *testing.T) {
	args := buildExtractAudioArgs(ExtractAudioOptionsDto{
		InputPath:        "in.mp4",
		OutputPath:       "out.mp3",
		OutputFormat:     "mp3",
		AudioBitrate:     "original",
		Volume:           100,
		Speed:            1,
		SourceAudioCodec: "mp3",
	})
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "-c:a copy") {
		t.Fatalf("expected stream copy, got %v", args)
	}
	if strings.Contains(joined, "-af") {
		t.Fatalf("did not expect audio filter, got %v", args)
	}
}

func TestBuildExtractAudioArgs_SpeedForcesTranscode(t *testing.T) {
	args := buildExtractAudioArgs(ExtractAudioOptionsDto{
		InputPath:        "in.mp4",
		OutputPath:       "out.mp3",
		OutputFormat:     "mp3",
		AudioBitrate:     "original",
		Volume:           100,
		Speed:            1.5,
		SourceAudioCodec: "mp3",
	})
	joined := strings.Join(args, " ")
	if strings.Contains(joined, "-c:a copy") {
		t.Fatalf("speed change should not copy stream, got %v", args)
	}
	if !strings.Contains(joined, "atempo=1.5") {
		t.Fatalf("expected atempo filter, got %v", args)
	}
}

func TestBuildExtractAudioArgs_VolumeAndMetadata(t *testing.T) {
	args := buildExtractAudioArgs(ExtractAudioOptionsDto{
		InputPath:    "in.mp4",
		OutputPath:   "out.flac",
		OutputFormat: "flac",
		AudioBitrate: "original",
		Volume:       150,
		Speed:        1,
		Metadata: structs.ExtractAudioMetadataDto{
			Title:  "My Song",
			Artist: "Artist",
		},
	})
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "volume=1.500") {
		t.Fatalf("expected volume filter, got %v", args)
	}
	if !strings.Contains(joined, "-metadata title=My Song") {
		t.Fatalf("expected title metadata, got %v", args)
	}
	if !strings.Contains(joined, "-c:a flac") {
		t.Fatalf("expected flac codec, got %v", args)
	}
}

func TestBuildAtempoChain_WideSpeed(t *testing.T) {
	got := buildAtempoChain(4)
	if got != "atempo=2,atempo=2" {
		t.Fatalf("expected chained atempo, got %q", got)
	}
}

func TestFormatProbeBitrate(t *testing.T) {
	if got := formatProbeBitrate(192000); got != "192k" {
		t.Fatalf("got %q", got)
	}
	if got := formatProbeBitrate(40000); got != "64k" {
		t.Fatalf("got %q", got)
	}
}
