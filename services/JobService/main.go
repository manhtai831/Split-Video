package JobService

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
	"strings"
	"time"

	"gorm.io/gorm"
)

type ListJobsOptions struct {
	Statuses   []enums.Status
	Type       *enums.JobType
	From       *time.Time
	To         *time.Time
	ActiveOnly bool
	Page       int
	Limit      int
}

type JobStats struct {
	Pending          int64
	Processing       int64
	CompletedToday   int64
	Failed           int64
	Total            int64
	AvgEncodeSeconds int64
}

func userScopeQuery(userID string) *gorm.DB {
	return Global.DB.Where("user_id = ?", userID)
}

func GetAllJobs() ([]entities.Job, error) {
	var jobs []entities.Job
	result := Global.DB.Where("status = ?", enums.StatusPending).Order("id ASC").Find(&jobs)
	return jobs, result.Error
}

func GetJobById(id int) (entities.Job, error) {
	var job entities.Job
	result := Global.DB.Where("id = ?", id).First(&job)
	return job, result.Error
}

func GetJobByIdentifier(identifier string) (entities.Job, error) {
	var job entities.Job
	result := Global.DB.Where("identifier = ?", identifier).First(&job)
	return job, result.Error
}

func GetJobByIdentifierForUser(identifier, userID string) (entities.Job, error) {
	var job entities.Job
	result := userScopeQuery(userID).Where("identifier = ?", identifier).First(&job)
	return job, result.Error
}

func UpdateJob(id int, job entities.Job) error {
	job.UpdatedAt = time.Now()
	result := Global.DB.Model(&entities.Job{}).Where("id = ?", id).Updates(job)
	return result.Error
}

func ResetJobForRetry(jobID int) error {
	now := time.Now()
	return Global.DB.Model(&entities.Job{}).Where("id = ?", jobID).Updates(map[string]interface{}{
		"status":      enums.StatusPending,
		"progress":    0,
		"error":       "",
		"started_at":  time.Time{},
		"finished_at": time.Time{},
		"download_at": time.Time{},
		"updated_at":  now,
	}).Error
}

func MarkJobDownloaded(jobID int) error {
	var job entities.Job
	if err := Global.DB.Where("id = ?", jobID).First(&job).Error; err != nil {
		return err
	}
	if !job.DownloadAt.IsZero() {
		return nil
	}
	now := time.Now()
	return Global.DB.Model(&entities.Job{}).Where("id = ?", jobID).Updates(map[string]interface{}{
		"download_at": now,
		"updated_at":  now,
	}).Error
}

func applyListFilters(query *gorm.DB, opts ListJobsOptions) *gorm.DB {
	if opts.ActiveOnly {
		query = query.Where("status IN ?", []enums.Status{enums.StatusPending, enums.StatusProcessing})
	} else if len(opts.Statuses) > 0 {
		query = query.Where("status IN ?", opts.Statuses)
	}
	if opts.From != nil {
		query = query.Where("created_at >= ?", *opts.From)
	}
	if opts.To != nil {
		query = query.Where("created_at <= ?", *opts.To)
	}
	if opts.Type != nil {
		query = query.Where("type = ?", *opts.Type)
	}
	return query
}

func ListJobsByUser(userID string, opts ListJobsOptions) ([]entities.Job, int64, error) {
	if opts.Page < 1 {
		opts.Page = 1
	}
	if opts.Limit < 1 {
		opts.Limit = 5
	}

	base := applyListFilters(userScopeQuery(userID).Model(&entities.Job{}), opts)

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var jobs []entities.Job
	offset := (opts.Page - 1) * opts.Limit
	err := applyListFilters(userScopeQuery(userID), opts).
		Order("created_at DESC").
		Offset(offset).
		Limit(opts.Limit).
		Find(&jobs).Error

	return jobs, total, err
}

func ListAllJobs(opts ListJobsOptions) ([]entities.Job, int64, error) {
	if opts.Page < 1 {
		opts.Page = 1
	}
	if opts.Limit < 1 {
		opts.Limit = 20
	}

	base := applyListFilters(Global.DB.Model(&entities.Job{}), opts)

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var jobs []entities.Job
	offset := (opts.Page - 1) * opts.Limit
	err := applyListFilters(Global.DB, opts).
		Order("created_at DESC").
		Offset(offset).
		Limit(opts.Limit).
		Find(&jobs).Error

	return jobs, total, err
}

func GetGlobalStats() (JobStats, error) {
	var stats JobStats
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	weekAgo := now.Add(-7 * 24 * time.Hour)

	Global.DB.Model(&entities.Job{}).
		Where("status = ?", enums.StatusPending).
		Count(&stats.Pending)

	Global.DB.Model(&entities.Job{}).
		Where("status = ?", enums.StatusProcessing).
		Count(&stats.Processing)

	Global.DB.Model(&entities.Job{}).
		Where("status = ? AND finished_at >= ?", enums.StatusCompleted, todayStart).
		Count(&stats.CompletedToday)

	Global.DB.Model(&entities.Job{}).
		Where("status = ? AND created_at >= ?", enums.StatusFailed, weekAgo).
		Count(&stats.Failed)

	Global.DB.Model(&entities.Job{}).Count(&stats.Total)

	type avgRow struct {
		AvgSeconds float64
	}
	var row avgRow
	err := Global.DB.Model(&entities.Job{}).
		Select("AVG(CAST((julianday(finished_at) - julianday(started_at)) * 86400 AS INTEGER)) as avg_seconds").
		Where("status = ? AND finished_at >= ? AND started_at > '0001-01-02'", enums.StatusCompleted, weekAgo).
		Scan(&row).Error
	if err == nil && row.AvgSeconds > 0 {
		stats.AvgEncodeSeconds = int64(row.AvgSeconds)
	}

	return stats, err
}

func GetStatsByUser(userID string) (JobStats, error) {
	var stats JobStats
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	weekAgo := now.Add(-7 * 24 * time.Hour)

	userScopeQuery(userID).Model(&entities.Job{}).
		Where("status = ?", enums.StatusPending).
		Count(&stats.Pending)

	userScopeQuery(userID).Model(&entities.Job{}).
		Where("status = ?", enums.StatusProcessing).
		Count(&stats.Processing)

	userScopeQuery(userID).Model(&entities.Job{}).
		Where("status = ? AND finished_at >= ?", enums.StatusCompleted, todayStart).
		Count(&stats.CompletedToday)

	userScopeQuery(userID).Model(&entities.Job{}).
		Where("status = ? AND created_at >= ?", enums.StatusFailed, weekAgo).
		Count(&stats.Failed)

	userScopeQuery(userID).Model(&entities.Job{}).Count(&stats.Total)

	type avgRow struct {
		AvgSeconds float64
	}
	var row avgRow
	err := userScopeQuery(userID).Model(&entities.Job{}).
		Select("AVG(CAST((julianday(finished_at) - julianday(started_at)) * 86400 AS INTEGER)) as avg_seconds").
		Where("status = ? AND finished_at >= ? AND started_at > '0001-01-02'", enums.StatusCompleted, weekAgo).
		Scan(&row).Error
	if err == nil && row.AvgSeconds > 0 {
		stats.AvgEncodeSeconds = int64(row.AvgSeconds)
	}

	return stats, err
}

func ParseStatusFilter(raw string) []enums.Status {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	var statuses []enums.Status
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		statuses = append(statuses, enums.Status(p))
	}
	return statuses
}
