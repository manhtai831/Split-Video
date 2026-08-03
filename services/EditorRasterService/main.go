package EditorRasterService

import (
	"app/structs"
	"context"
	"fmt"
	"image/color"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/fogleman/gg"
)

const defaultFontPath = "assets/fonts/DejaVuSans.ttf"

var rgbaRe = regexp.MustCompile(`rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)`)

type RenderOptions struct {
	JobID   int
	Extras  structs.EditorJobExtrasDto
	Layers  []structs.EditorLayerDto
	TempDir string
}

func RenderLayers(ctx context.Context, opts RenderOptions) (map[string]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	tempDir := opts.TempDir
	if tempDir == "" {
		tempDir = filepath.Join("uploads", "tmp", "editor", strconv.Itoa(opts.JobID))
	}
	if err := os.MkdirAll(tempDir, 0o755); err != nil {
		return nil, fmt.Errorf("create temp dir: %w", err)
	}

	frameW := opts.Extras.Frame.Width
	frameH := opts.Extras.Frame.Height
	paths := make(map[string]string)

	for _, layer := range opts.Layers {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		switch layer.Kind {
		case "text", "shape", "draw":
		default:
			continue
		}

		rect := layer.PixelRect(frameW, frameH)
		outPath := filepath.Join(tempDir, fmt.Sprintf("layer-%s.png", sanitizeID(layer.ID)))
		if err := renderLayerPNG(layer, rect, frameH, outPath); err != nil {
			return nil, fmt.Errorf("rasterize layer %s: %w", layer.ID, err)
		}
		paths[layer.ID] = outPath
	}

	return paths, nil
}

func renderLayerPNG(layer structs.EditorLayerDto, rect structs.PixelRect, frameH int, outPath string) error {
	dc := gg.NewContext(rect.W, rect.H)
	dc.SetRGBA(0, 0, 0, 0)
	dc.Clear()

	switch layer.Kind {
	case "text":
		return renderTextLayer(dc, layer, rect, frameH, outPath)
	case "shape":
		return renderShapeLayer(dc, layer, rect, outPath)
	case "draw":
		return renderDrawLayer(dc, layer, rect, outPath)
	default:
		return fmt.Errorf("unsupported raster kind %q", layer.Kind)
	}
}

func renderTextLayer(dc *gg.Context, layer structs.EditorLayerDto, rect structs.PixelRect, frameH int, outPath string) error {
	if bg := parseColor(layer.BgColor); bg.A > 0 {
		dc.SetColor(bg)
		dc.DrawRectangle(0, 0, float64(rect.W), float64(rect.H))
		dc.Fill()
	}

	fontSize := layer.FontSize
	if fontSize <= 0 {
		fontSize = math.Max(12, float64(rect.H)*0.6)
	}
	if err := dc.LoadFontFace(defaultFontPath, fontSize); err != nil {
		return err
	}

	textColor := parseColor(layer.Color)
	if textColor.A == 0 {
		textColor = color.RGBA{R: 255, G: 255, B: 255, A: 255}
	}
	dc.SetColor(textColor)

	text := layer.EffectiveText()
	textW, textH := dc.MeasureString(text)
	x := (float64(rect.W) - textW) / 2
	y := (float64(rect.H)+textH)/2 - 2
	dc.DrawString(text, x, y)

	return dc.SavePNG(outPath)
}

func renderShapeLayer(dc *gg.Context, layer structs.EditorLayerDto, rect structs.PixelRect, outPath string) error {
	w := float64(rect.W)
	h := float64(rect.H)
	sw := math.Max(1, layer.StrokeWidth)
	stroke := parseColor(layer.Stroke)
	fill := parseColor(layer.Fill)
	inset := sw / 2

	switch layer.Shape {
	case "rect":
		drawRect(dc, inset, inset, w-sw, h-sw, sw, stroke, fill)
	case "circle":
		drawEllipse(dc, w/2, h/2, math.Max(0, w/2-inset), math.Max(0, h/2-inset), sw, stroke, fill)
	case "line":
		drawLine(dc, inset, inset, w-inset, h-inset, sw, stroke)
	case "triangle":
		points := []gg.Point{
			{X: w / 2, Y: inset},
			{X: w - inset, Y: h - inset},
			{X: inset, Y: h - inset},
		}
		drawPolygon(dc, points, sw, stroke, fill)
	case "arrow":
		drawArrow(dc, layer, w, h, sw, stroke)
	default:
		drawRect(dc, inset, inset, w-sw, h-sw, sw, stroke, fill)
	}

	return dc.SavePNG(outPath)
}

func renderDrawLayer(dc *gg.Context, layer structs.EditorLayerDto, rect structs.PixelRect, outPath string) error {
	w := float64(rect.W)
	h := float64(rect.H)
	for _, path := range layer.Paths {
		if len(path.Points) < 2 {
			continue
		}
		stroke := parseColor(path.Stroke)
		if stroke.A == 0 {
			stroke = color.RGBA{R: 255, G: 255, B: 255, A: 255}
		}
		sw := math.Max(1, path.Width)
		dc.SetColor(stroke)
		dc.SetLineWidth(sw)
		dc.SetLineCap(gg.LineCapRound)
		dc.SetLineJoin(gg.LineJoinRound)
		dc.NewSubPath()
		dc.MoveTo(path.Points[0][0]*w, path.Points[0][1]*h)
		for i := 1; i < len(path.Points); i++ {
			dc.LineTo(path.Points[i][0]*w, path.Points[i][1]*h)
		}
		dc.Stroke()
	}
	return dc.SavePNG(outPath)
}

func drawRect(dc *gg.Context, x, y, w, h, sw float64, stroke, fill color.RGBA) {
	if fill.A > 0 {
		dc.SetColor(fill)
		dc.DrawRectangle(x, y, w, h)
		dc.Fill()
	}
	if stroke.A > 0 && sw > 0 {
		dc.SetColor(stroke)
		dc.SetLineWidth(sw)
		dc.DrawRectangle(x, y, w, h)
		dc.Stroke()
	}
}

func drawEllipse(dc *gg.Context, cx, cy, rx, ry, sw float64, stroke, fill color.RGBA) {
	if fill.A > 0 {
		dc.SetColor(fill)
		dc.DrawEllipse(cx, cy, rx, ry)
		dc.Fill()
	}
	if stroke.A > 0 && sw > 0 {
		dc.SetColor(stroke)
		dc.SetLineWidth(sw)
		dc.DrawEllipse(cx, cy, rx, ry)
		dc.Stroke()
	}
}

func drawLine(dc *gg.Context, x1, y1, x2, y2, sw float64, stroke color.RGBA) {
	if stroke.A == 0 || sw <= 0 {
		return
	}
	dc.SetColor(stroke)
	dc.SetLineWidth(sw)
	dc.SetLineCap(gg.LineCapRound)
	dc.DrawLine(x1, y1, x2, y2)
	dc.Stroke()
}

func arrowLocalEnds(layer structs.EditorLayerDto, w, h, sw float64) (x1, y1, x2, y2 float64) {
	inset := sw / 2
	if layer.HasArrowEnds && layer.Width > 0 && layer.Height > 0 {
		return (layer.X1 - layer.X) / layer.Width * w,
			(layer.Y1 - layer.Y) / layer.Height * h,
			(layer.X2 - layer.X) / layer.Width * w,
			(layer.Y2 - layer.Y) / layer.Height * h
	}
	return inset, h / 2, w - inset, h / 2
}

func drawArrow(dc *gg.Context, layer structs.EditorLayerDto, w, h, sw float64, stroke color.RGBA) {
	ax1, ay1, ax2, ay2 := arrowLocalEnds(layer, w, h, sw)
	dx := ax2 - ax1
	dy := ay2 - ay1
	length := math.Hypot(dx, dy)
	if length < 1e-6 {
		drawLine(dc, ax1, ay1, ax2, ay2, sw, stroke)
		return
	}
	ux := dx / length
	uy := dy / length
	px := -uy
	py := ux
	headLen := math.Min(length*0.28, math.Max(sw*3.5, 14))
	headHalf := headLen * 0.55
	baseX := ax2 - ux*headLen
	baseY := ay2 - uy*headLen
	drawLine(dc, ax1, ay1, baseX, baseY, sw, stroke)
	drawPolygon(dc, []gg.Point{
		{X: baseX + px*headHalf, Y: baseY + py*headHalf},
		{X: ax2, Y: ay2},
		{X: baseX - px*headHalf, Y: baseY - py*headHalf},
	}, 0, color.RGBA{}, stroke)
}

func drawPolygon(dc *gg.Context, points []gg.Point, sw float64, stroke, fill color.RGBA) {
	if len(points) < 3 {
		return
	}
	dc.NewSubPath()
	dc.MoveTo(points[0].X, points[0].Y)
	for i := 1; i < len(points); i++ {
		dc.LineTo(points[i].X, points[i].Y)
	}
	dc.ClosePath()
	if fill.A > 0 {
		dc.SetColor(fill)
		dc.Fill()
	}
	if stroke.A > 0 && sw > 0 {
		dc.SetColor(stroke)
		dc.SetLineWidth(sw)
		dc.Stroke()
	} else if stroke.A > 0 && sw == 0 {
		dc.SetColor(stroke)
		dc.Fill()
	}
}

func parseColor(raw string) color.RGBA {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.EqualFold(raw, "transparent") {
		return color.RGBA{}
	}
	if strings.HasPrefix(raw, "#") {
		return parseHexColor(raw)
	}
	if m := rgbaRe.FindStringSubmatch(raw); len(m) >= 4 {
		r := clampByte(parseFloat(m[1]))
		g := clampByte(parseFloat(m[2]))
		b := clampByte(parseFloat(m[3]))
		a := 255.0
		if len(m) >= 5 && m[4] != "" {
			a = parseFloat(m[4]) * 255
		}
		return color.RGBA{R: r, G: g, B: b, A: clampByte(a)}
	}
	return color.RGBA{}
}

func parseHexColor(raw string) color.RGBA {
	raw = strings.TrimPrefix(raw, "#")
	if len(raw) == 3 {
		raw = string([]byte{raw[0], raw[0], raw[1], raw[1], raw[2], raw[2]})
	}
	if len(raw) != 6 {
		return color.RGBA{}
	}
	r, _ := strconv.ParseUint(raw[0:2], 16, 8)
	g, _ := strconv.ParseUint(raw[2:4], 16, 8)
	b, _ := strconv.ParseUint(raw[4:6], 16, 8)
	return color.RGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: 255}
}

func parseFloat(raw string) float64 {
	v, _ := strconv.ParseFloat(raw, 64)
	return v
}

func clampByte(v float64) uint8 {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return uint8(math.Round(v))
}

func sanitizeID(id string) string {
	id = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, id)
	if id == "" {
		return "layer"
	}
	return id
}
