package structs

import "app/enums"

type SplitOptionsDto struct {
	InputPath  string
	OutputDir  string
	SplitMode  enums.SplitMode
	SizeLimit  int64
	TimeLimit  float64
	OutputExt  string
	Encode     FfmpegEncodeOptionsDto
	NamePrefix string
	OnProgress ProgressCallback
}

type ProgressCallback func(done SegmentResultDto, totalDuration, encodedDuration float64)
