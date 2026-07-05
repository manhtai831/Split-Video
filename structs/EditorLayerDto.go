package structs

import (
	"fmt"
	"math"
	"sort"
	"strconv"
)

const textPlaceholder = "Nhập text…"

type EditorDrawPathDto struct {
	Points [][]float64 `json:"points"`
	Stroke string      `json:"stroke"`
	Width  float64     `json:"width"`
}

type EditorLayerDto struct {
	ID            string
	Kind          string
	FileID        int
	X             float64
	Y             float64
	Width         float64
	Height        float64
	Rotation      float64
	Opacity       float64
	ZIndex        int
	Visible       bool
	Start         float64
	End           float64
	AlwaysVisible bool
	Text          string
	FontSize      float64
	Color         string
	BgColor       string
	Shape         string
	Stroke        string
	Fill          string
	StrokeWidth   float64
	Paths         []EditorDrawPathDto
	BlurAmount    float64
	Muted         bool
	Loop          bool
}

type PixelRect struct {
	X int
	Y int
	W int
	H int
}

func ParseEditorLayer(raw map[string]interface{}) (EditorLayerDto, error) {
	if raw == nil {
		return EditorLayerDto{}, fmt.Errorf("layer is nil")
	}

	layer := EditorLayerDto{
		ID:            stringField(raw, "id"),
		Kind:          stringField(raw, "kind"),
		FileID:        intField(raw, "fileId"),
		X:             floatField(raw, "x"),
		Y:             floatField(raw, "y"),
		Width:         floatField(raw, "width"),
		Height:        floatField(raw, "height"),
		Rotation:      floatField(raw, "rotation"),
		Opacity:       floatFieldDefault(raw, "opacity", 1),
		ZIndex:        intFieldDefault(raw, "zIndex", 1),
		Visible:       boolFieldDefault(raw, "visible", true),
		Start:         floatField(raw, "start"),
		End:           floatField(raw, "end"),
		AlwaysVisible: boolField(raw, "alwaysVisible"),
		Text:          stringField(raw, "text"),
		FontSize:      floatFieldDefault(raw, "fontSize", 28),
		Color:         stringFieldDefault(raw, "color", "#ffffff"),
		BgColor:       stringField(raw, "bgColor"),
		Shape:         stringFieldDefault(raw, "shape", "rect"),
		Stroke:        stringFieldDefault(raw, "stroke", "#ffffff"),
		Fill:          stringFieldDefault(raw, "fill", "transparent"),
		StrokeWidth:   floatFieldDefault(raw, "strokeWidth", 6),
		BlurAmount:    floatFieldDefault(raw, "blurAmount", 12),
		Muted:         boolFieldDefault(raw, "muted", true),
		Loop:          boolField(raw, "loop"),
	}

	paths, err := parseDrawPaths(raw["paths"])
	if err != nil {
		return EditorLayerDto{}, err
	}
	layer.Paths = paths

	if layer.Kind == "" {
		return EditorLayerDto{}, fmt.Errorf("layer kind is required")
	}

	return layer, nil
}

func ParseEditorLayers(raw []map[string]interface{}) ([]EditorLayerDto, error) {
	layers := make([]EditorLayerDto, 0, len(raw))
	for i, m := range raw {
		layer, err := ParseEditorLayer(m)
		if err != nil {
			return nil, fmt.Errorf("layer %d: %w", i, err)
		}
		layers = append(layers, layer)
	}
	return layers, nil
}

func SortLayersByZIndex(layers []EditorLayerDto) []EditorLayerDto {
	filtered := make([]EditorLayerDto, 0, len(layers))
	for _, layer := range layers {
		if layer.Kind == "bound" || !layer.Visible {
			continue
		}
		filtered = append(filtered, layer)
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		if filtered[i].ZIndex == filtered[j].ZIndex {
			return i < j
		}
		return filtered[i].ZIndex < filtered[j].ZIndex
	})
	return filtered
}

func (l EditorLayerDto) PixelRect(frameW, frameH int) PixelRect {
	return PixelRect{
		X: int(math.Round(l.X * float64(frameW))),
		Y: int(math.Round(l.Y * float64(frameH))),
		W: maxInt(1, int(math.Round(l.Width*float64(frameW)))),
		H: maxInt(1, int(math.Round(l.Height*float64(frameH)))),
	}
}

func (l EditorLayerDto) LayerDuration(projectDuration float64) float64 {
	if l.AlwaysVisible {
		return projectDuration
	}
	if l.End > l.Start {
		return l.End - l.Start
	}
	return projectDuration
}

func (l EditorLayerDto) EnableExpr(projectDuration float64) string {
	if l.AlwaysVisible {
		return fmt.Sprintf("gte(t,0)*lte(t,%s)", formatEditorSeconds(projectDuration))
	}
	return fmt.Sprintf("between(t,%s,%s)", formatEditorSeconds(l.Start), formatEditorSeconds(l.End))
}

func (l EditorLayerDto) EffectiveText() string {
	if l.Text == "" || l.Text == textPlaceholder {
		return "Text"
	}
	return l.Text
}

func formatEditorSeconds(seconds float64) string {
	return strconv.FormatFloat(seconds, 'f', 3, 64)
}

func parseDrawPaths(raw interface{}) ([]EditorDrawPathDto, error) {
	items, ok := raw.([]interface{})
	if !ok || len(items) == 0 {
		return nil, nil
	}

	paths := make([]EditorDrawPathDto, 0, len(items))
	for i, item := range items {
		m, ok := item.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("path %d: expected object", i)
		}
		path := EditorDrawPathDto{
			Stroke: stringFieldDefault(m, "stroke", "#ffffff"),
			Width:  floatFieldDefault(m, "strokeWidth", floatFieldDefault(m, "width", 6)),
		}
		pointsRaw, ok := m["points"].([]interface{})
		if !ok {
			continue
		}
		for _, pt := range pointsRaw {
			coords, ok := pt.([]interface{})
			if !ok || len(coords) < 2 {
				continue
			}
			path.Points = append(path.Points, []float64{
				floatFromInterface(coords[0]),
				floatFromInterface(coords[1]),
			})
		}
		if len(path.Points) >= 2 {
			paths = append(paths, path)
		}
	}
	return paths, nil
}

func stringField(m map[string]interface{}, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}

func stringFieldDefault(m map[string]interface{}, key, fallback string) string {
	v := stringField(m, key)
	if v == "" {
		return fallback
	}
	return v
}

func floatField(m map[string]interface{}, key string) float64 {
	v, ok := m[key]
	if !ok || v == nil {
		return 0
	}
	return floatFromInterface(v)
}

func floatFieldDefault(m map[string]interface{}, key string, fallback float64) float64 {
	v, ok := m[key]
	if !ok || v == nil {
		return fallback
	}
	return floatFromInterface(v)
}

func intField(m map[string]interface{}, key string) int {
	v, ok := m[key]
	if !ok || v == nil {
		return 0
	}
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	default:
		return 0
	}
}

func intFieldDefault(m map[string]interface{}, key string, fallback int) int {
	v, ok := m[key]
	if !ok || v == nil {
		return fallback
	}
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	default:
		return fallback
	}
}

func boolField(m map[string]interface{}, key string) bool {
	v, ok := m[key]
	if !ok || v == nil {
		return false
	}
	switch t := v.(type) {
	case bool:
		return t
	default:
		return false
	}
}

func boolFieldDefault(m map[string]interface{}, key string, fallback bool) bool {
	v, ok := m[key]
	if !ok || v == nil {
		return fallback
	}
	switch t := v.(type) {
	case bool:
		return t
	default:
		return fallback
	}
}

func floatFromInterface(v interface{}) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case int64:
		return float64(t)
	default:
		return 0
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
