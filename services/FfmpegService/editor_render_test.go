package FfmpegService

import (
	"app/structs"
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
