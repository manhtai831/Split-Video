package SplitService

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
	fileSize := fileStat.Size()
	job := entities.Job{
		Identifier: uuid.New().String(),
		Status:     enums.StatusPending,
		Type:       enums.JobTypeSplit,
		Extras:     extras,
		UserID:     userID,
	}

	result := Global.DB.Create(&job)

	jobFileData := entities.JobFileData{
		JobID: job.ID,
		Name:  name,
		Size:  fileSize,
		Path:  videoPath,
		Type:  enums.JobFileDataTypeInput,
	}
	result = Global.DB.Create(&jobFileData)

	return job, result.Error
}
