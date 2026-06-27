package structs

type SplitBySizeOptionsDto struct {
	InputPath  string
	OutputDir  string
	SizeLimit  int64
	OutputExt  string
	Encode     FfmpegEncodeOptionsDto
	NamePrefix string
	OnProgress ProgressCallback
}

type ProgressCallback func(done SegmentResultDto, totalDuration, encodedDuration float64)
