package GifService

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
	"os"

	"github.com/google/uuid"
)

func CreateJob(videoPath string, name string, extras string, userID string) (entities.Job, error) {
	fileStat, err := os.Stat(videoPath)
	if err != nil {
		return entities.Job{}, err
	}

	job := entities.Job{
		Identifier: uuid.New().String(),
		Status:     enums.StatusPending,
		Type:       enums.JobTypeGif,
		Extras:     extras,
		UserID:     userID,
	}

	if err := Global.DB.Create(&job).Error; err != nil {
		return entities.Job{}, err
	}

	jobFileData := entities.JobFileData{
		JobID: job.ID,
		Name:  name,
		Size:  fileStat.Size(),
		Path:  videoPath,
		Type:  enums.JobFileDataTypeInput,
	}
	if err := Global.DB.Create(&jobFileData).Error; err != nil {
		return entities.Job{}, err
	}

	return job, nil
}
