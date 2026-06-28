package SplitVideoWorker

import (
	"app/entities"
	"app/enums"
	"app/services/FfmpegService"
	"app/services/JobFileDataService"
	"app/services/JobService"
	"app/structs"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

const defaultSizeLimit = 8 * 1024 * 1024 // 8MB

func Process(job entities.Job, context context.Context) error {
	if job.Status == enums.StatusCompleted || job.Status == enums.StatusFailed || job.Status == enums.StatusCancelled {
		return nil
	}

	jobFileDatas, err := JobFileDataService.GetJobFileDataByJobId(job.ID, enums.JobFileDataTypeInput)
	if err != nil {
		return errors.New("[SplitVideoWorker] error getting job file data: " + err.Error())
	}

	var jobFileDataInput entities.JobFileData
	for _, fileData := range jobFileDatas {
		if fileData.Type == enums.JobFileDataTypeInput {
			jobFileDataInput = fileData
			break
		}
	}
	if jobFileDataInput.Path == "" {
		return errors.New("[SplitVideoWorker] no input job file data found for job")
	}

	jobFileDataInput.Duration, err = FfmpegService.GetDuration(context, jobFileDataInput.Path)
	if err != nil {
		return errors.New("[SplitVideoWorker] error getting metadata: " + err.Error())
	}
	JobFileDataService.UpdateJobFileData(&jobFileDataInput)

	outputDir := filepath.Join("uploads", "output", "splits", strconv.Itoa(job.ID))

	os.RemoveAll(outputDir)

	baseFileName := filepath.Base(jobFileDataInput.Path)
	segments, err := FfmpegService.SplitBySize(context, structs.SplitBySizeOptionsDto{
		InputPath:  jobFileDataInput.Path,
		OutputDir:  outputDir,
		SizeLimit:  defaultSizeLimit,
		OutputExt:  "mp4",
		NamePrefix: baseFileName,
		Encode: structs.FfmpegEncodeOptionsDto{
			VideoCodec:  "libx264",
			AudioCodec:  "aac",
			PixelFormat: "yuv420p",
		},
		OnProgress: func(done structs.SegmentResultDto, totalDuration, encodedDuration float64) {
			JobService.UpdateJob(job.ID, entities.Job{
				Progress: encodedDuration / totalDuration,
			})
		},
	})
	if err != nil {
		updateJobFailed(job.ID, err.Error())
		return err
	}

	for _, segment := range segments {
		err = JobFileDataService.CreateJobFileData(entities.JobFileData{
			JobID:    job.ID,
			Name:     jobFileDataInput.Name + "-" + strconv.Itoa(segment.Index) + ".mp4",
			Size:     segment.Size,
			Duration: segment.Duration,
			Path:     segment.Path,
			Type:     enums.JobFileDataTypeOutput,
		})
		if err != nil {
			return fmt.Errorf("[SplitVideoWorker] create output job file data: %w", err)
		}
	}

	return nil
}

func updateJobFailed(jobID int, message string) {
	JobService.UpdateJob(jobID, entities.Job{
		Status: enums.StatusFailed,
		Error:  message,
	})
}
