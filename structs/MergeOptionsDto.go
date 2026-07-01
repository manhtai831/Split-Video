package structs

type MergeOptionsDto struct {
	Inputs     []string
	OutputPath string
	OutputExt  string
	Encode     FfmpegEncodeOptionsDto
	OnProgress func(progress float64)
}
