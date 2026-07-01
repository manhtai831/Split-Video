package structs

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

const (
	GifMaxSegmentDuration = 30.0
	GifMaxSegments        = 20
	GifMinDimension       = 16
	GifMaxDimension       = 1920
)

type GifSegmentDto struct {
	StartAt  float64 `json:"start_at"`
	Duration float64 `json:"duration"`
}

type GifDimensionDto struct {
	Mode   string `json:"mode"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type GifQualityDto struct {
	Preset      string `json:"preset"`
	MaxColors   int    `json:"max_colors,omitempty"`
	Dither      string `json:"dither,omitempty"`
	WebpQuality int    `json:"webp_quality,omitempty"`
	Lossless    bool   `json:"lossless,omitempty"`
}

type GifJobExtrasDto struct {
	Segments  []GifSegmentDto `json:"segments"`
	OutputFmt string          `json:"output_fmt"`
	Dimension GifDimensionDto `json:"dimension"`
	Quality   GifQualityDto   `json:"quality"`
	FPS       int             `json:"fps"`
	Loop      bool            `json:"loop"`
}

type GifQualityParams struct {
	MaxColors   int
	Dither      string
	WebpQuality int
	Lossless    bool
	Compression int
}

var allowedGifFormats = map[string]bool{
	"gif": true, "webp": true, "apng": true,
}

var allowedDimensionModes = map[string]bool{
	"aspect_lock": true, "manual": true,
}

var allowedQualityPresets = map[string]bool{
	"low": true, "medium": true, "high": true, "max": true, "custom": true,
}

var allowedGifFPS = map[int]bool{1: true, 5: true, 10: true, 15: true, 24: true, 30: true}

var allowedDithers = map[string]bool{
	"none": true, "bayer": true, "floyd_steinberg": true,
}

func ParseGifForm(fields map[string]string) (GifJobExtrasDto, error) {
	segments, err := parseGifSegments(fields)
	if err != nil {
		return GifJobExtrasDto{}, err
	}
	if len(segments) == 0 {
		return GifJobExtrasDto{}, fmt.Errorf("cần ít nhất một đoạn video")
	}
	if len(segments) > GifMaxSegments {
		return GifJobExtrasDto{}, fmt.Errorf("tối đa %d đoạn mỗi job", GifMaxSegments)
	}
	for i, seg := range segments {
		if seg.Duration <= 0 {
			return GifJobExtrasDto{}, fmt.Errorf("đoạn %d: duration phải lớn hơn 0", i+1)
		}
		if seg.Duration > GifMaxSegmentDuration {
			return GifJobExtrasDto{}, fmt.Errorf("đoạn %d: tối đa %.0f giây mỗi đoạn", i+1, GifMaxSegmentDuration)
		}
		if seg.StartAt < 0 {
			return GifJobExtrasDto{}, fmt.Errorf("đoạn %d: start_at không hợp lệ", i+1)
		}
	}

	outputFmt := fields["output_fmt"]
	if outputFmt == "" {
		outputFmt = "gif"
	}
	if !allowedGifFormats[outputFmt] {
		return GifJobExtrasDto{}, fmt.Errorf("invalid output_fmt: %q", outputFmt)
	}

	dimMode := fields["dimension_mode"]
	if dimMode == "" {
		dimMode = "aspect_lock"
	}
	if !allowedDimensionModes[dimMode] {
		return GifJobExtrasDto{}, fmt.Errorf("invalid dimension_mode: %q", dimMode)
	}

	width, err := parsePositiveInt(fields["width"], "width")
	if err != nil {
		return GifJobExtrasDto{}, err
	}
	height, err := parsePositiveInt(fields["height"], "height")
	if err != nil {
		return GifJobExtrasDto{}, err
	}
	width, height = normalizeEvenDimensions(width, height)
	if err := validateDimensions(width, height); err != nil {
		return GifJobExtrasDto{}, err
	}

	quality, err := parseGifQuality(fields, outputFmt)
	if err != nil {
		return GifJobExtrasDto{}, err
	}

	fps, err := parseGifFPS(fields["fps"])
	if err != nil {
		return GifJobExtrasDto{}, err
	}

	loop := fields["loop"] == "on" || fields["loop"] == "1" || fields["loop"] == "true"

	return GifJobExtrasDto{
		Segments:  segments,
		OutputFmt: outputFmt,
		Dimension: GifDimensionDto{
			Mode:   dimMode,
			Width:  width,
			Height: height,
		},
		Quality: quality,
		FPS:     fps,
		Loop:    loop,
	}, nil
}

func parseGifSegments(fields map[string]string) ([]GifSegmentDto, error) {
	if raw := strings.TrimSpace(fields["segments_json"]); raw != "" {
		var segments []GifSegmentDto
		if err := json.Unmarshal([]byte(raw), &segments); err != nil {
			return nil, fmt.Errorf("invalid segments_json: %w", err)
		}
		return segments, nil
	}

	startAt, err := parseFloatField(fields["start_at"], "start_at", 0)
	if err != nil {
		return nil, err
	}
	duration, err := parseFloatField(fields["duration"], "duration", 0)
	if err != nil {
		return nil, err
	}
	if duration <= 0 {
		return nil, fmt.Errorf("duration phải lớn hơn 0")
	}
	return []GifSegmentDto{{StartAt: startAt, Duration: duration}}, nil
}

func parseGifQuality(fields map[string]string, outputFmt string) (GifQualityDto, error) {
	preset := fields["quality_preset"]
	if preset == "" {
		preset = "high"
	}
	if !allowedQualityPresets[preset] {
		return GifQualityDto{}, fmt.Errorf("invalid quality_preset: %q", preset)
	}

	q := GifQualityDto{Preset: preset}

	if preset != "custom" {
		return q, nil
	}

	switch outputFmt {
	case "gif", "apng":
		maxColors, err := parsePositiveInt(fields["max_colors"], "max_colors")
		if err != nil {
			return GifQualityDto{}, err
		}
		if maxColors < 2 || maxColors > 256 {
			return GifQualityDto{}, fmt.Errorf("max_colors phải từ 2 đến 256")
		}
		dither := fields["dither"]
		if dither == "" {
			dither = "floyd_steinberg"
		}
		if !allowedDithers[dither] {
			return GifQualityDto{}, fmt.Errorf("invalid dither: %q", dither)
		}
		q.MaxColors = maxColors
		q.Dither = dither
	case "webp":
		quality, err := parsePositiveInt(fields["webp_quality"], "webp_quality")
		if err != nil {
			return GifQualityDto{}, err
		}
		if quality < 0 || quality > 100 {
			return GifQualityDto{}, fmt.Errorf("webp_quality phải từ 0 đến 100")
		}
		q.WebpQuality = quality
		q.Lossless = fields["lossless"] == "on" || fields["lossless"] == "1" || fields["lossless"] == "true"
	}

	return q, nil
}

func parseGifFPS(raw string) (int, error) {
	if raw == "" {
		return 10, nil
	}
	fps, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid fps: %q", raw)
	}
	if !allowedGifFPS[fps] {
		return 0, fmt.Errorf("invalid fps: %d", fps)
	}
	return fps, nil
}

func parsePositiveInt(raw, field string) (int, error) {
	if raw == "" {
		return 0, fmt.Errorf("%s is required", field)
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %q", field, raw)
	}
	if n <= 0 {
		return 0, fmt.Errorf("%s phải lớn hơn 0", field)
	}
	return n, nil
}

func parseFloatField(raw, field string, defaultVal float64) (float64, error) {
	if raw == "" {
		return defaultVal, nil
	}
	n, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %q", field, raw)
	}
	if n < 0 {
		return 0, fmt.Errorf("%s phải không âm", field)
	}
	return n, nil
}

func normalizeEvenDimensions(width, height int) (int, int) {
	if width%2 != 0 {
		width++
	}
	if height%2 != 0 {
		height++
	}
	return width, height
}

func validateDimensions(width, height int) error {
	if width < GifMinDimension || height < GifMinDimension {
		return fmt.Errorf("kích thước tối thiểu %d×%d", GifMinDimension, GifMinDimension)
	}
	if width > GifMaxDimension || height > GifMaxDimension {
		return fmt.Errorf("kích thước tối đa %d×%d", GifMaxDimension, GifMaxDimension)
	}
	return nil
}

func ResolveDimensions(dim GifDimensionDto, probe MediaProbeDto) (int, int, error) {
	width, height := dim.Width, dim.Height

	if dim.Mode == "aspect_lock" && probe.Width > 0 && probe.Height > 0 {
		srcRatio := float64(probe.Width) / float64(probe.Height)
		dstRatio := float64(width) / float64(height)
		if math.Abs(srcRatio-dstRatio) > 0.02 {
			height = int(math.Round(float64(width) / srcRatio))
		}
	}

	width, height = normalizeEvenDimensions(width, height)
	if err := validateDimensions(width, height); err != nil {
		return 0, 0, err
	}
	return width, height, nil
}

func ResolveGifQuality(outputFmt string, q GifQualityDto) GifQualityParams {
	if q.Preset == "custom" {
		params := GifQualityParams{
			MaxColors:   q.MaxColors,
			Dither:      q.Dither,
			WebpQuality: q.WebpQuality,
			Lossless:    q.Lossless,
		}
		if params.MaxColors == 0 {
			params.MaxColors = 256
		}
		if params.Dither == "" {
			params.Dither = "floyd_steinberg"
		}
		if params.WebpQuality == 0 {
			params.WebpQuality = 75
		}
		return params
	}

	switch outputFmt {
	case "webp":
		switch q.Preset {
		case "low":
			return GifQualityParams{WebpQuality: 50, Lossless: false}
		case "medium":
			return GifQualityParams{WebpQuality: 75, Lossless: false}
		case "high":
			return GifQualityParams{WebpQuality: 90, Lossless: false}
		case "max":
			return GifQualityParams{Lossless: true}
		default:
			return GifQualityParams{WebpQuality: 90, Lossless: false}
		}
	case "apng":
		switch q.Preset {
		case "low":
			return GifQualityParams{MaxColors: 64, Dither: "none", Compression: 9}
		case "medium":
			return GifQualityParams{MaxColors: 128, Dither: "bayer", Compression: 6}
		case "high", "max":
			return GifQualityParams{MaxColors: 256, Dither: "floyd_steinberg", Compression: 3}
		default:
			return GifQualityParams{MaxColors: 256, Dither: "floyd_steinberg", Compression: 3}
		}
	default:
		switch q.Preset {
		case "low":
			return GifQualityParams{MaxColors: 64, Dither: "none"}
		case "medium":
			return GifQualityParams{MaxColors: 128, Dither: "bayer"}
		case "high", "max":
			return GifQualityParams{MaxColors: 256, Dither: "floyd_steinberg"}
		default:
			return GifQualityParams{MaxColors: 256, Dither: "floyd_steinberg"}
		}
	}
}

func (d GifJobExtrasDto) ToJSON() (string, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ParseGifJobExtrasJSON(raw string) (GifJobExtrasDto, error) {
	if raw == "" {
		return GifJobExtrasDto{}, fmt.Errorf("empty extras")
	}
	var extras GifJobExtrasDto
	if err := json.Unmarshal([]byte(raw), &extras); err != nil {
		return GifJobExtrasDto{}, err
	}
	return extras, nil
}
