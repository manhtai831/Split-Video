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
	"strings"
)

func Process(job entities.Job, ctx context.Context) error {
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

	jobFileDataInput.Duration, err = FfmpegService.GetDuration(ctx, jobFileDataInput.Path)
	if err != nil {
		return errors.New("[SplitVideoWorker] error getting metadata: " + err.Error())
	}
	JobFileDataService.UpdateJobFileData(&jobFileDataInput)

	outputDir := filepath.Join("uploads", "output", "splits", strconv.Itoa(job.ID))

	os.RemoveAll(outputDir)

	baseFileName := strings.TrimSuffix(filepath.Base(jobFileDataInput.Path), filepath.Ext(jobFileDataInput.Path))
	extras := resolveExtras(job)
	encodeOpts := extras.Encode
	splitMode := extras.SplitMode
	if splitMode == "" {
		splitMode = "size"
	}

	var segments []structs.SegmentResultDto
	if splitMode == "time" {
		segments, err = processSplitByTime(ctx, job, jobFileDataInput, outputDir, baseFileName, encodeOpts, extras.TimeLimit)
	} else {
		segments, err = processSplitBySize(ctx, job, jobFileDataInput, outputDir, baseFileName, encodeOpts, extras.SizeLimit)
	}
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return err
		}
		updateJobFailed(job.ID, err.Error())
		return err
	}

	for _, segment := range segments {
		err = JobFileDataService.CreateJobFileData(entities.JobFileData{
			JobID:    job.ID,
			Name:     strings.TrimSuffix(jobFileDataInput.Name, filepath.Ext(jobFileDataInput.Path)) + "-" + strconv.Itoa(segment.Index) + ".mp4",
			Size:     segment.Size,
			Duration: segment.Duration,
			Path:     segment.Path,
			Type:     enums.JobFileDataTypeOutput,
			From:     segment.StartAt,
			To:       segment.StartAt + segment.Duration,
		})
		if err != nil {
			return fmt.Errorf("[SplitVideoWorker] create output job file data: %w", err)
		}
	}

	return nil
}

func processSingleFile(
	ctx context.Context,
	job entities.Job,
	inputPath string,
	outputDir string,
	baseFileName string,
	encodeOpts structs.FfmpegEncodeOptionsDto,
) ([]structs.SegmentResultDto, error) {
	output := filepath.Join(outputDir, baseFileName+"-1.mp4")
	seg, err := FfmpegService.EncodeSegment(ctx, inputPath, output, 0, 0, 0, encodeOpts)
	if err != nil {
		return nil, err
	}
	JobService.UpdateJob(job.ID, entities.Job{Progress: 1})
	seg.Index = 1
	return []structs.SegmentResultDto{seg}, nil
}

func processSplitBySize(
	ctx context.Context,
	job entities.Job,
	jobFileDataInput entities.JobFileData,
	outputDir string,
	baseFileName string,
	encodeOpts structs.FfmpegEncodeOptionsDto,
	sizeLimit int64,
) ([]structs.SegmentResultDto, error) {
	if sizeLimit <= 0 {
		return processSingleFile(ctx, job, jobFileDataInput.Path, outputDir, baseFileName, encodeOpts)
	}
	return FfmpegService.SplitBySize(ctx, structs.SplitBySizeOptionsDto{
		InputPath:  jobFileDataInput.Path,
		OutputDir:  outputDir,
		SizeLimit:  sizeLimit,
		OutputExt:  "mp4",
		NamePrefix: baseFileName,
		Encode:     encodeOpts,
		OnProgress: func(done structs.SegmentResultDto, totalDuration, encodedDuration float64) {
			JobService.UpdateJob(job.ID, entities.Job{
				Progress: encodedDuration / totalDuration,
			})
		},
	})
}

func processSplitByTime(
	ctx context.Context,
	job entities.Job,
	jobFileDataInput entities.JobFileData,
	outputDir string,
	baseFileName string,
	encodeOpts structs.FfmpegEncodeOptionsDto,
	timeLimit float64,
) ([]structs.SegmentResultDto, error) {
	if timeLimit <= 0 {
		return processSingleFile(ctx, job, jobFileDataInput.Path, outputDir, baseFileName, encodeOpts)
	}
	return FfmpegService.SplitByTime(ctx, structs.SplitByTimeOptionsDto{
		InputPath:  jobFileDataInput.Path,
		OutputDir:  outputDir,
		TimeLimit:  timeLimit,
		OutputExt:  "mp4",
		NamePrefix: baseFileName,
		Encode:     encodeOpts,
		OnProgress: func(done structs.SegmentResultDto, totalDuration, encodedDuration float64) {
			JobService.UpdateJob(job.ID, entities.Job{
				Progress: encodedDuration / totalDuration,
			})
		},
	})
}

func resolveExtras(job entities.Job) structs.SplitJobExtrasDto {
	if job.Extras == "" {
		return structs.SplitJobExtrasDto{Encode: structs.DefaultSplitEncodeOptions()}
	}
	extras, err := structs.ParseSplitJobExtrasJSON(job.Extras)
	if err != nil {
		return structs.SplitJobExtrasDto{Encode: structs.DefaultSplitEncodeOptions()}
	}
	return extras
}

func updateJobFailed(jobID int, message string) {
	JobService.UpdateJob(jobID, entities.Job{
		Status: enums.StatusFailed,
		Error:  message,
	})
}
