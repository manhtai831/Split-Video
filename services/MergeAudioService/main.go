package MergeAudioService

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
	Path      string
	Name      string
	SortOrder int
}

func CreateJob(inputs []InputFile, extras string, userID string) (entities.Job, error) {
	job := entities.Job{
		Identifier: uuid.New().String(),
		Status:     enums.StatusPending,
		Type:       enums.JobTypeMergeAudio,
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

		duration, _ := FfmpegService.GetDuration(ctx, input.Path)

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
