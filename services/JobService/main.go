package JobService

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
)

func GetAllJobs() ([]entities.Job, error) {
	var jobs []entities.Job
	result := Global.DB.Find(&jobs).Where("status = ?", enums.StatusProcessing).Order("id ASC").Select("id")
	return jobs, result.Error
}

func UpdateJob(id int, job entities.Job) error {
	result := Global.DB.Model(&entities.Job{}).Where("id = ?", id).Updates(job)
	return result.Error
}

func GetJobById(id int) (entities.Job, error) {
	var job entities.Job
	result := Global.DB.Where("id = ?", id).First(&job)
	return job, result.Error
}
