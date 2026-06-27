package JobFileDataService

import (
	"app/common/Global"
	"app/entities"
)

func GetJobFileDataByJobId(jobId int) ([]entities.JobFileData, error) {
	var jobFileData []entities.JobFileData
	result := Global.DB.Where("job_id = ?", jobId).Find(&jobFileData)
	return jobFileData, result.Error
}

func CreateJobFileData(jobFileData entities.JobFileData) error {
	result := Global.DB.Create(&jobFileData)
	return result.Error
}
