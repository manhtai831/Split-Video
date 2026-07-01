package structs

type GifOptionsDto struct {
	InputPath  string
	OutputPath string
	StartAt    float64
	Duration   float64
	Width      int
	Height     int
	FPS        int
	Loop       bool
	OutputFmt  string
	Quality    GifQualityParams
	OnProgress func(progress float64)
}
