package structs

type SplitOptionsDto struct {
	InputPath  string
	OutputDir  string
	SplitMode  string
	SizeLimit  int64
	TimeLimit  float64
	OutputExt  string
	Encode     FfmpegEncodeOptionsDto
	NamePrefix string
	OnProgress ProgressCallback
}

type ProgressCallback func(done SegmentResultDto, totalDuration, encodedDuration float64)
