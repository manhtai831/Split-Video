package JobFileDataService

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
	"fmt"

	"gorm.io/gorm"
)

func outputFileJoinQuery(identifier, userID string) *gorm.DB {
	return Global.DB.Model(&entities.JobFileData{}).
		Joins("INNER JOIN jobs ON jobs.id = job_file_data.job_id").
		Where("jobs.identifier = ? AND jobs.user_id = ?", identifier, userID).
		Where("job_file_data.type = ?", enums.JobFileDataTypeOutput)
}

func GetOutputFileByIdentifierAndUser(identifier, userID string, fileID int) (entities.JobFileData, error) {
	var data entities.JobFileData
	err := outputFileJoinQuery(identifier, userID).
		Where("job_file_data.id = ?", fileID).
		First(&data).Error
	return data, err
}

func GetOutputFilesByIdentifierAndUser(identifier, userID string, fileIDs []int) ([]entities.JobFileData, error) {
	if len(fileIDs) == 0 {
		return nil, fmt.Errorf("no files selected")
	}

	var files []entities.JobFileData
	err := outputFileJoinQuery(identifier, userID).
		Where("job_file_data.id IN ?", fileIDs).
		Find(&files).Error
	if err != nil {
		return nil, err
	}
	if len(files) != len(fileIDs) {
		return nil, gorm.ErrRecordNotFound
	}

	byID := make(map[int]entities.JobFileData, len(files))
	for _, f := range files {
		byID[f.ID] = f
	}

	ordered := make([]entities.JobFileData, 0, len(fileIDs))
	for _, id := range fileIDs {
		f, ok := byID[id]
		if !ok {
			return nil, gorm.ErrRecordNotFound
		}
		ordered = append(ordered, f)
	}
	return ordered, nil
}

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
