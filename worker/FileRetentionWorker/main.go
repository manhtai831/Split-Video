package FileRetentionWorker

import (
	"app/common/Global"
	"app/config"
	"app/entities"
	"app/enums"
	"app/services/ChunkUploadService"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func Start() {
	go func() {
		runCleanup()
		ticker := time.NewTicker(24 * time.Hour)
		for range ticker.C {
			runCleanup()
		}
	}()
}

func runCleanup() {
	cleanupOrphanChunks()
	cutoff := time.Now().AddDate(0, 0, -config.FileRetentionDays)
	statuses := []enums.Status{
		enums.StatusCompleted,
		enums.StatusFailed,
		enums.StatusCancelled,
	}

	var jobs []entities.Job
	err := Global.DB.
		Where("status IN ?", statuses).
		Where("updated_at < ?", cutoff).
		Find(&jobs).Error
	if err != nil {
		fmt.Printf("[FileRetentionWorker] query jobs: %v\n", err)
		return
	}

	for _, job := range jobs {
		if err := purgeJob(job); err != nil {
			fmt.Printf("[FileRetentionWorker] purge job %d: %v\n", job.ID, err)
		}
	}
}

func purgeJob(job entities.Job) error {
	var files []entities.JobFileData
	if err := Global.DB.Where("job_id = ?", job.ID).Find(&files).Error; err != nil {
		return err
	}

	for _, f := range files {
		if f.Path != "" {
			_ = os.Remove(f.Path)
		}
	}

	outputDirs := []string{
		filepath.Join("uploads", "output", "splits", fmt.Sprintf("%d", job.ID)),
		filepath.Join("uploads", "output", "merges", fmt.Sprintf("%d", job.ID)),
		filepath.Join("uploads", "output", "gifs", fmt.Sprintf("%d", job.ID)),
		filepath.Join("uploads", "output", "extract-audio", fmt.Sprintf("%d", job.ID)),
		filepath.Join("uploads", "output", "editor", fmt.Sprintf("%d", job.ID)),
		filepath.Join("uploads", "tmp", "editor", fmt.Sprintf("%d", job.ID)),
	}
	for _, dir := range outputDirs {
		_ = os.RemoveAll(dir)
	}

	if err := Global.DB.Where("job_id = ?", job.ID).Delete(&entities.JobFileData{}).Error; err != nil {
		return err
	}
	return Global.DB.Delete(&job).Error
}

func cleanupOrphanChunks() {
	if err := ChunkUploadService.CleanupOrphanChunks(); err != nil {
		fmt.Printf("[FileRetentionWorker] cleanup orphan chunks: %v\n", err)
	}
}
