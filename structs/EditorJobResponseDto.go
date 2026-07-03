package structs

type EditorInputFileDto struct {
	ID       int     `json:"id"`
	Name     string  `json:"name"`
	Size     int64   `json:"size"`
	Duration float64 `json:"duration"`
}

type EditorJobResponseDto struct {
	Identifier  string               `json:"identifier"`
	Status      string               `json:"status"`
	Frame       EditorFrameDto       `json:"frame"`
	FramePreset string               `json:"framePreset"`
	Duration    float64              `json:"duration"`
	Layers      []map[string]interface{} `json:"layers"`
	Files       []EditorInputFileDto `json:"files"`
}
