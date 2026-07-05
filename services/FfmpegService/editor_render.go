package FfmpegService

import (
	"app/structs"
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
)

// editorBlurGblurSigmaFactor maps CSS backdrop-filter blur(px) to FFmpeg gblur sigma.
// CSS and gblur both use Gaussian σ in pixels, but gblur (IIR, steps=1) looks weaker in practice.
const editorBlurGblurSigmaFactor = 1.5

type EditorRenderOptions struct {
	Extras      structs.EditorJobExtrasDto
	Layers      []structs.EditorLayerDto
	FilePaths   map[int]string
	RasterPaths map[string]string
	OutputPath  string
	TempDir     string
	Encode      structs.FfmpegEncodeOptionsDto
	OnProgress  func(float64)
}

type editorInput struct {
	args []string
}

type editorAudioTrack struct {
	label string
}

type audioMixResult struct {
	filterExpr string
	mapLabel   string
}

func RenderEditorProject(ctx context.Context, opts EditorRenderOptions) (structs.SegmentResultDto, error) {
	if opts.OutputPath == "" {
		return structs.SegmentResultDto{}, fmt.Errorf("output path is required")
	}

	frameW := opts.Extras.Frame.Width
	frameH := opts.Extras.Frame.Height
	if frameW < 1 || frameH < 1 {
		return structs.SegmentResultDto{}, fmt.Errorf("invalid frame size %dx%d", frameW, frameH)
	}

	duration := opts.Extras.Duration
	if duration <= 0 {
		return structs.SegmentResultDto{}, fmt.Errorf("duration must be positive")
	}

	fps := opts.Encode.FPS
	if fps <= 0 {
		fps = 30
	}

	if err := os.MkdirAll(filepath.Dir(opts.OutputPath), 0o755); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("create output dir: %w", err)
	}

	if opts.OnProgress != nil {
		opts.OnProgress(0.2)
	}

	inputs, filterParts, finalLabel, audioTracks, err := buildEditorFilterGraph(
		ctx,
		opts.Layers,
		opts.Extras,
		opts.FilePaths,
		opts.RasterPaths,
		fps,
	)
	if err != nil {
		return structs.SegmentResultDto{}, err
	}

	if err := ctx.Err(); err != nil {
		return structs.SegmentResultDto{}, err
	}

	audioMix, hasAudio := buildAudioMixFilter(audioTracks)
	if hasAudio && audioMix.filterExpr != "" {
		filterParts = append(filterParts, audioMix.filterExpr)
	}

	args := []string{"-y"}
	for _, input := range inputs {
		args = append(args, input.args...)
	}
	args = append(args, "-filter_complex", strings.Join(filterParts, ";"))
	args = append(args, "-map", finalLabel)
	if hasAudio {
		args = append(args, "-map", audioMix.mapLabel)
	}

	encode := normalizeEditorEncode(opts.Encode)
	args = append(args, encodeArgsForEditorFilter(encode)...)
	if !hasAudio {
		args = append(args, "-an")
	}
	args = append(args, "-movflags", "+faststart", opts.OutputPath)

	if opts.OnProgress != nil {
		opts.OnProgress(0.3)
	}

	if _, err := runCommand(ctx, "ffmpeg", args...); err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("render editor project: %w", err)
	}

	if opts.OnProgress != nil {
		opts.OnProgress(1)
	}

	outDuration, err := GetDuration(ctx, opts.OutputPath)
	if err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("probe output: %w", err)
	}

	stat, err := os.Stat(opts.OutputPath)
	if err != nil {
		return structs.SegmentResultDto{}, fmt.Errorf("stat output: %w", err)
	}

	return structs.SegmentResultDto{
		Path:     opts.OutputPath,
		Duration: outDuration,
		Size:     stat.Size(),
		StartAt:  0,
		Index:    1,
	}, nil
}

func buildEditorFilterGraph(
	ctx context.Context,
	layers []structs.EditorLayerDto,
	extras structs.EditorJobExtrasDto,
	filePaths map[int]string,
	rasterPaths map[string]string,
	fps int,
) ([]editorInput, []string, string, []editorAudioTrack, error) {
	frameW := extras.Frame.Width
	frameH := extras.Frame.Height
	duration := extras.Duration

	inputs := []editorInput{
		{args: editorBaseInputArgs(frameW, frameH, duration, fps)},
	}

	filterParts := []string{}
	currentLabel := "[0:v]"
	nextInputIndex := 1
	audioTracks := []editorAudioTrack{}
	step := 0

	for _, layer := range layers {
		enable := layer.EnableExpr(duration)
		rect := layer.PixelRect(frameW, frameH)
		opacity := layer.Opacity
		if opacity <= 0 {
			continue
		}
		if opacity > 1 {
			opacity = 1
		}

		outLabel := fmt.Sprintf("[v%d]", step+1)

		switch layer.Kind {
		case "blur":
			filterParts = append(filterParts, buildBlurFilter(currentLabel, layer, rect, enable, step, outLabel))
			currentLabel = outLabel
			step++
			continue

		case "image", "video":
			path, ok := filePaths[layer.FileID]
			if !ok || path == "" {
				return nil, nil, "", nil, fmt.Errorf("missing input file for layer %s (fileId=%d)", layer.ID, layer.FileID)
			}

			layerDur := layer.LayerDuration(duration)
			inputArgs := []string{}
			if layer.Kind == "image" {
				inputArgs = append(inputArgs, "-loop", "1", "-t", formatSeconds(layerDur))
			}
			inputArgs = append(inputArgs, "-i", path)
			inputs = append(inputs, editorInput{args: inputArgs})

			prepLabel := fmt.Sprintf("[lay_%d]", step)
			var prepFilter string
			if layer.Kind == "video" {
				prepFilter = buildVideoPrepFilter(nextInputIndex, layer, rect, opacity, layerDur, prepLabel)
			} else {
				prepFilter = buildImagePrepFilter(nextInputIndex, rect, opacity, prepLabel)
			}
			filterParts = append(filterParts, prepFilter)
			filterParts = append(filterParts, buildOverlayFilter(currentLabel, prepLabel, rect, enable, outLabel))

			if layer.Kind == "video" && !layer.Muted {
				probe, err := ProbeMedia(ctx, path)
				if err == nil && probe.AudioCodec != "" {
					aLabel := fmt.Sprintf("[lay_a_%d]", step)
					startMs := int(math.Round(layerStart(layer) * 1000))
					filterParts = append(filterParts, fmt.Sprintf("[%d:a]adelay=%d|%d%s", nextInputIndex, startMs, startMs, aLabel))
					audioTracks = append(audioTracks, editorAudioTrack{label: aLabel})
				}
			}

			currentLabel = outLabel
			nextInputIndex++
			step++

		case "text", "shape", "draw":
			pngPath, ok := rasterPaths[layer.ID]
			if !ok || pngPath == "" {
				return nil, nil, "", nil, fmt.Errorf("missing raster PNG for layer %s", layer.ID)
			}
			layerDur := layer.LayerDuration(duration)
			inputs = append(inputs, editorInput{
				args: []string{"-loop", "1", "-t", formatSeconds(layerDur), "-i", pngPath},
			})
			prepLabel := fmt.Sprintf("[lay_%d]", step)
			filterParts = append(filterParts, buildRasterPrepFilter(nextInputIndex, rect, opacity, prepLabel))
			filterParts = append(filterParts, buildOverlayFilter(currentLabel, prepLabel, rect, enable, outLabel))
			currentLabel = outLabel
			nextInputIndex++
			step++
		}
	}

	return inputs, filterParts, currentLabel, audioTracks, nil
}

func buildBlurFilter(currentLabel string, layer structs.EditorLayerDto, rect structs.PixelRect, enable string, step int, outLabel string) string {
	sigma := layer.BlurAmount * editorBlurGblurSigmaFactor
	if sigma < 0.5 {
		sigma = 0.5
	}
	mainLabel := fmt.Sprintf("[blur_main_%d]", step)
	blurSrcLabel := fmt.Sprintf("[blur_src_%d]", step)
	blurredLabel := fmt.Sprintf("[blur_out_%d]", step)

	return fmt.Sprintf(
		"%ssplit=2%s%s;%scrop=%d:%d:%d:%d,gblur=sigma=%s%s;%s%soverlay=%d:%d:enable='%s'%s",
		currentLabel,
		mainLabel, blurSrcLabel,
		blurSrcLabel,
		rect.W, rect.H, rect.X, rect.Y,
		formatSeconds(sigma), blurredLabel,
		mainLabel, blurredLabel,
		rect.X, rect.Y, enable, outLabel,
	)
}

func buildVideoPrepFilter(inputIndex int, layer structs.EditorLayerDto, rect structs.PixelRect, opacity, layerDur float64, outLabel string) string {
	inLabel := fmt.Sprintf("[%d:v]", inputIndex)
	chain := fmt.Sprintf("trim=duration=%s,setpts=PTS-STARTPTS,", formatSeconds(layerDur))
	chain += buildMediaFitChain(rect, layer.Rotation, opacity)
	return fmt.Sprintf("%s%s%s", inLabel, chain, outLabel)
}

func buildImagePrepFilter(inputIndex int, rect structs.PixelRect, opacity float64, outLabel string) string {
	inLabel := fmt.Sprintf("[%d:v]", inputIndex)
	chain := buildMediaFitChain(rect, 0, opacity)
	return fmt.Sprintf("%s%s%s", inLabel, chain, outLabel)
}

func buildRasterPrepFilter(inputIndex int, rect structs.PixelRect, opacity float64, outLabel string) string {
	inLabel := fmt.Sprintf("[%d:v]", inputIndex)
	chain := buildRasterOpacityChain(rect, opacity)
	return fmt.Sprintf("%s%s%s", inLabel, chain, outLabel)
}

// buildMediaFitChain matches preview CSS object-fit:contain — scale down preserving
// aspect ratio, pad with transparent pixels so the frame-bound black canvas shows through.
func buildMediaFitChain(rect structs.PixelRect, rotation, opacity float64) string {
	w, h := even(rect.W), even(rect.H)
	parts := []string{
		fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease", w, h),
		fmt.Sprintf("pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black@0", w, h),
	}
	parts = append(parts, buildRotationCropChain(w, h, rotation)...)
	parts = append(parts, "format=rgba")
	if opacity < 1 {
		parts = append(parts, fmt.Sprintf("colorchannelmixer=aa=%s", formatSeconds(opacity)))
	}
	return strings.Join(parts, ",")
}

func buildRasterOpacityChain(rect structs.PixelRect, opacity float64) string {
	w, h := even(rect.W), even(rect.H)
	parts := []string{
		fmt.Sprintf("scale=%d:%d", w, h),
		"format=rgba",
	}
	if opacity < 1 {
		parts = append(parts, fmt.Sprintf("colorchannelmixer=aa=%s", formatSeconds(opacity)))
	}
	return strings.Join(parts, ",")
}

func buildRotationCropChain(w, h int, rotation float64) []string {
	if rotation == 0 {
		return nil
	}
	rad := rotation * math.Pi / 180
	return []string{
		fmt.Sprintf("rotate=%s:c=none@0:ow=iw:oh=ih", formatSeconds(rad)),
		fmt.Sprintf("crop=%d:%d:(iw-%d)/2:(ih-%d)/2", w, h, w, h),
	}
}

func buildScaleRotateOpacityChain(rect structs.PixelRect, rotation, opacity float64) string {
	return buildMediaFitChain(rect, rotation, opacity)
}

func BuildOverlayFilter(baseLabel, srcLabel string, rect structs.PixelRect, enable, outLabel string) string {
	return buildOverlayFilter(baseLabel, srcLabel, rect, enable, outLabel)
}

func buildOverlayFilter(baseLabel, srcLabel string, rect structs.PixelRect, enable, outLabel string) string {
	return fmt.Sprintf("%s%soverlay=%d:%d:enable='%s'%s",
		baseLabel, srcLabel, rect.X, rect.Y, enable, outLabel)
}

func buildAudioMixFilter(tracks []editorAudioTrack) (audioMixResult, bool) {
	if len(tracks) == 0 {
		return audioMixResult{}, false
	}
	if len(tracks) == 1 {
		return audioMixResult{mapLabel: tracks[0].label}, true
	}
	inputs := strings.Builder{}
	for _, track := range tracks {
		inputs.WriteString(track.label)
	}
	return audioMixResult{
		filterExpr: fmt.Sprintf("%samix=inputs=%d:duration=longest:dropout_transition=0[outa]", inputs.String(), len(tracks)),
		mapLabel:   "[outa]",
	}, true
}

func layerStart(layer structs.EditorLayerDto) float64 {
	if layer.AlwaysVisible {
		return 0
	}
	return layer.Start
}

func normalizeEditorEncode(encode structs.FfmpegEncodeOptionsDto) structs.FfmpegEncodeOptionsDto {
	enc := encode
	if enc.VideoCodec == "" {
		enc.VideoCodec = "libx264"
	}
	if enc.PixelFormat == "" {
		enc.PixelFormat = "yuv420p"
	}
	if enc.CRF == 0 && enc.VideoBitrate == "" {
		enc.CRF = 23
	}
	if enc.Preset == "" {
		enc.Preset = "medium"
	}
	if enc.FPS <= 0 {
		enc.FPS = 30
	}
	if !enc.Mute && enc.AudioCodec == "" {
		enc.AudioCodec = "aac"
		if enc.AudioBitrate == "" {
			enc.AudioBitrate = "128k"
		}
	}
	return enc
}

func encodeArgsForEditorFilter(encode structs.FfmpegEncodeOptionsDto) []string {
	enc := encode
	enc.Scale = ""
	return BuildEncodeArgs(enc)
}

func editorBaseInputArgs(frameW, frameH int, duration float64, fps int) []string {
	return []string{
		"-f", "lavfi",
		"-i", fmt.Sprintf("color=c=black:s=%dx%d:d=%s:r=%d", frameW, frameH, formatSeconds(duration), fps),
	}
}
