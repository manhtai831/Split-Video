package SplitVideoWorker

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
	"app/services/FfmpegService"
	"app/services/JobFileDataService"
	"app/services/JobService"
	"app/structs"
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
)

const defaultSizeLimit = 8 * 1024 * 1024 // 8MB

func Process(job entities.Job) error {
	fmt.Printf("Processing job: %d\n", job.ID)

	jobFileDatas, err := JobFileDataService.GetJobFileDataByJobId(job.ID)
	if err != nil {
		fmt.Printf("Error getting job file data: %v\n", err)
		return errors.New("error getting job file data")
	}

	var jobFileDataInput entities.JobFileData
	for _, fileData := range jobFileDatas {
		if fileData.Type == enums.JobFileDataTypeInput {
			jobFileDataInput = fileData
			break
		}
	}
	if jobFileDataInput.Path == "" {
		return errors.New("no input job file data found for job")
	}

	outputDir := filepath.Join("uploads", "output", strconv.Itoa(job.ID))
	segments, err := FfmpegService.SplitBySize(context.Background(), structs.SplitBySizeOptionsDto{
		InputPath:  jobFileDataInput.Path,
		OutputDir:  outputDir,
		SizeLimit:  defaultSizeLimit,
		OutputExt:  "mp4",
		NamePrefix: "video",
		Encode: structs.FfmpegEncodeOptionsDto{
			VideoCodec:  "libx264",
			AudioCodec:  "aac",
			PixelFormat: "yuv420p",
		},
	})
	if err != nil {
		updateJobFailed(job.ID, err.Error())
		return err
	}

	for _, segment := range segments {
		err = JobFileDataService.CreateJobFileData(entities.JobFileData{
			JobID:    job.ID,
			Name:     filepath.Base(segment.Path),
			Size:     segment.Size,
			Duration: segment.Duration,
			Path:     segment.Path,
			Type:     enums.JobFileDataTypeOutput,
		})
		if err != nil {
			updateJobFailed(job.ID, err.Error())
			return fmt.Errorf("create output job file data: %w", err)
		}
	}

	err = JobService.UpdateJob(job.ID, entities.Job{
		Status: enums.StatusCompleted,
		Result: outputDir,
	})
	if err != nil {
		return fmt.Errorf("update job status: %w", err)
	}

	return nil
}

func updateJobFailed(jobID int, message string) {
	_ = Global.DB.Model(&entities.Job{}).Where("id = ?", jobID).Updates(entities.Job{
		Status: enums.StatusFailed,
		Error:  message,
	})
}
