package structs

type SplitByTimeOptionsDto struct {
	InputPath  string
	OutputDir  string
	TimeLimit  float64
	OutputExt  string
	Encode     FfmpegEncodeOptionsDto
	NamePrefix string
	OnProgress ProgressCallback
}
