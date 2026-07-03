package enums

type JobType string

const (
	JobTypeSplit        JobType = "split"
	JobTypeMerge        JobType = "merge"
	JobTypeGif          JobType = "gif"
	JobTypeExtractAudio JobType = "extract_audio"
	JobTypeEditor       JobType = "editor"
)
