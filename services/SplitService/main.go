package SplitService

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
	"os"
)

func CreateJob(videoPath string, name string) (entities.Job, error) {
	fileStat, err := os.Stat(videoPath)
	if err != nil {
		return entities.Job{}, err
	}
	fileSize := fileStat.Size()
	job := entities.Job{
		Status: enums.StatusPending,
		Type:   enums.JobTypeSplit,
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
