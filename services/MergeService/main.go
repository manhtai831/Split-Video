package MergeService

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
	"app/services/FfmpegService"
	"context"
	"os"

	"github.com/google/uuid"
)

type InputFile struct {
	Path         string
	Name         string
	SortOrder    int
	Kind         string
	HoldDuration float64
}

func CreateJob(inputs []InputFile, extras string, userID string) (entities.Job, error) {
	job := entities.Job{
		Identifier: uuid.New().String(),
		Status:     enums.StatusPending,
		Type:       enums.JobTypeMerge,
		Extras:     extras,
		UserID:     userID,
	}

	if err := Global.DB.Create(&job).Error; err != nil {
		return entities.Job{}, err
	}

	ctx := context.Background()
	for _, input := range inputs {
		fileStat, err := os.Stat(input.Path)
		if err != nil {
			return entities.Job{}, err
		}

		duration := resolveInputDuration(ctx, input)

		jobFileData := entities.JobFileData{
			JobID:     job.ID,
			Name:      input.Name,
			Size:      fileStat.Size(),
			Duration:  duration,
			Path:      input.Path,
			Type:      enums.JobFileDataTypeInput,
			SortOrder: input.SortOrder,
		}
		if err := Global.DB.Create(&jobFileData).Error; err != nil {
			return entities.Job{}, err
		}
	}

	return job, nil
}

func resolveInputDuration(ctx context.Context, input InputFile) float64 {
	switch input.Kind {
	case "image":
		if input.HoldDuration > 0 {
			return input.HoldDuration
		}
		return 2
	case "gif":
		if input.HoldDuration > 0 {
			return input.HoldDuration
		}
		duration, err := FfmpegService.GetDuration(ctx, input.Path)
		if err != nil || duration <= 0 {
			return 0
		}
		return duration
	default:
		duration, _ := FfmpegService.GetDuration(ctx, input.Path)
		return duration
	}
}
