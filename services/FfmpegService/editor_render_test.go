package FfmpegService

import (
	"app/structs"
	"context"
	"strings"
	"testing"
)

func TestBuildOverlayFilter(t *testing.T) {
	got := BuildOverlayFilter("[base]", "[src]", structs.PixelRect{X: 10, Y: 20, W: 100, H: 50}, "between(t,1.000,5.000)", "[out]")
	want := "[base][src]overlay=10:20:enable='between(t,1.000,5.000)'[out]"
	if got != want {
		t.Fatalf("unexpected overlay filter:\n got:  %s\n want: %s", got, want)
	}
}

func TestEditorLayerEnableExpr_inFilter(t *testing.T) {
	layer := structs.EditorLayerDto{AlwaysVisible: true}
	expr := layer.EnableExpr(30)
	filter := BuildOverlayFilter("[b]", "[s]", structs.PixelRect{X: 0, Y: 0, W: 10, H: 10}, expr, "[o]")
	if filter != "[b][s]overlay=0:0:enable='gte(t,0)*lte(t,30.000)'[o]" {
		t.Fatalf("unexpected filter: %s", filter)
	}
}

func TestEditorBaseInputArgs(t *testing.T) {
	args := editorBaseInputArgs(1920, 1080, 30, 30)
	if len(args) != 4 || args[0] != "-f" || args[1] != "lavfi" {
		t.Fatalf("unexpected args: %v", args)
	}
	if args[3] != "color=c=black:s=1920x1080:d=30.000:r=30" {
		t.Fatalf("unexpected lavfi input: %s", args[3])
	}
}

func TestBuildBlurFilter(t *testing.T) {
	layer := structs.EditorLayerDto{BlurAmount: 12}
	filter := buildBlurFilter("[base]", layer, structs.PixelRect{X: 100, Y: 50, W: 200, H: 120}, "between(t,0,10)", 0, "[v1]")
	if filter == "" {
		t.Fatal("expected blur filter")
	}
	if !containsAll(filter, "split=2", "gblur=sigma=18.000", "overlay=100:50") {
		t.Fatalf("unexpected blur filter: %s", filter)
	}
}

func TestBuildEditorAudioLayerFilter(t *testing.T) {
	got := buildEditorAudioLayerFilter(2, 1.25, 4.25, 150, "[audio]")
	want := "[2:a]atrim=duration=3.000,asetpts=PTS-STARTPTS,volume=1.500,adelay=1250|1250[audio]"
	if got != want {
		t.Fatalf("unexpected audio layer filter:\n got:  %s\n want: %s", got, want)
	}
}

func TestBuildEditorFilterGraph_audioLayer(t *testing.T) {
	inputs, filters, _, tracks, err := buildEditorFilterGraph(
		context.Background(),
		[]structs.EditorLayerDto{{
			ID: "audio-1", Kind: "audio", FileID: 8, Start: 3, End: 9, Volume: 50, Visible: true,
		}},
		structs.EditorJobExtrasDto{
			Frame:    structs.EditorFrameDto{Width: 1280, Height: 720},
			Duration: 5,
		},
		map[int]string{8: "/tmp/music.mp3"},
		nil,
		30,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(inputs) != 2 || len(inputs[1].args) != 2 || inputs[1].args[1] != "/tmp/music.mp3" {
		t.Fatalf("unexpected inputs: %+v", inputs)
	}
	if len(tracks) != 1 {
		t.Fatalf("expected one audio track, got %d", len(tracks))
	}
	if !containsAll(strings.Join(filters, ";"),
		"[1:a]atrim=duration=2.000",
		"volume=0.500",
		"adelay=3000|3000",
	) {
		t.Fatalf("unexpected filters: %v", filters)
	}
}

func TestBuildAudioMixFilter(t *testing.T) {
	tests := []struct {
		name        string
		tracks      []editorAudioTrack
		wantFilter  string
		wantMapLabel string
	}{
		{
			name:        "single track",
			tracks:      []editorAudioTrack{{label: "[a1]"}},
			wantFilter:  "[a1]atrim=duration=12.000,asetpts=PTS-STARTPTS[outa]",
			wantMapLabel: "[outa]",
		},
		{
			name:        "overlapping tracks",
			tracks:      []editorAudioTrack{{label: "[a1]"}, {label: "[a2]"}},
			wantFilter:  "[a1][a2]amix=inputs=2:duration=longest:dropout_transition=0[mixed];[mixed]atrim=duration=12.000,asetpts=PTS-STARTPTS[outa]",
			wantMapLabel: "[outa]",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := buildAudioMixFilter(tt.tracks, 12)
			if !ok {
				t.Fatal("expected audio mix")
			}
			if got.filterExpr != tt.wantFilter || got.mapLabel != tt.wantMapLabel {
				t.Fatalf("unexpected audio mix: %+v", got)
			}
		})
	}
}

func TestBuildMediaFitChain_contain(t *testing.T) {
	chain := buildMediaFitChain(structs.PixelRect{W: 320, H: 180}, 0, 1)
	if !containsAll(chain,
		"scale=320:180:force_original_aspect_ratio=decrease",
		"pad=320:180:(ow-iw)/2:(oh-ih)/2:color=black@0",
		"format=rgba",
	) {
		t.Fatalf("unexpected contain chain: %s", chain)
	}
}

func TestBuildMediaFitChain_rotation(t *testing.T) {
	chain := buildMediaFitChain(structs.PixelRect{W: 320, H: 180}, 45, 0.5)
	if !containsAll(chain, "rotate=", "crop=320:180", "colorchannelmixer=aa=0.500") {
		t.Fatalf("unexpected rotation chain: %s", chain)
	}
}

func containsAll(s string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(s, part) {
			return false
		}
	}
	return true
}
