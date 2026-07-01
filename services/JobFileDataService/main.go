package JobFileDataService

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
)

func GetJobFileDataByJobId(jobId int, jobFileDataType enums.JobFileDataType) ([]entities.JobFileData, error) {
	var jobFileDatas []entities.JobFileData
	query := Global.DB.Where("job_id = ? AND type = ?", jobId, jobFileDataType)
	if jobFileDataType == enums.JobFileDataTypeInput {
		query = query.Order("sort_order ASC, id ASC")
	}
	result := query.Find(&jobFileDatas)
	return jobFileDatas, result.Error
}

func GetJobFileDataById(id int) (entities.JobFileData, error) {
	var data entities.JobFileData
	result := Global.DB.Where("id = ?", id).First(&data)
	return data, result.Error
}

func CreateJobFileData(jobFileData entities.JobFileData) error {
	result := Global.DB.Create(&jobFileData)
	return result.Error
}

func UpdateJobFileData(jobFileData *entities.JobFileData) error {
	result := Global.DB.Save(&jobFileData)
	return result.Error
}

func DeleteOutputFilesByJobId(jobId int) error {
	result := Global.DB.Where("job_id = ? AND type = ?", jobId, enums.JobFileDataTypeOutput).Delete(&entities.JobFileData{})
	return result.Error
}
