package MergeVideoWorker

import (
	"app/entities"
	"app/enums"
	"app/services/FfmpegService"
	"app/services/JobFileDataService"
	"app/services/JobService"
	"app/structs"
	"context"
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func Process(job entities.Job, ctx context.Context) error {
	if job.Status == enums.StatusCompleted || job.Status == enums.StatusFailed || job.Status == enums.StatusCancelled {
		return nil
	}

	inputFiles, err := JobFileDataService.GetJobFileDataByJobId(job.ID, enums.JobFileDataTypeInput)
	if err != nil {
		return errors.New("[MergeVideoWorker] error getting job file data: " + err.Error())
	}
	if len(inputFiles) < 2 {
		return errors.New("[MergeVideoWorker] merge requires at least 2 input files")
	}

	extras := resolveExtras(job)
	outputExt := extras.OutputExt
	if outputExt == "" {
		outputExt = "mp4"
	}

	outputDir := filepath.Join("uploads", "output", "merges", fmt.Sprintf("%d", job.ID))
	os.RemoveAll(outputDir)

	var inputPaths []string
	var totalDuration float64
	for _, fileData := range inputFiles {
		duration, err := FfmpegService.GetDuration(ctx, fileData.Path)
		if err != nil {
			return fmt.Errorf("[MergeVideoWorker] error getting duration for %q: %w", fileData.Name, err)
		}
		fileData.Duration = duration
		JobFileDataService.UpdateJobFileData(&fileData)
		inputPaths = append(inputPaths, fileData.Path)
		totalDuration += duration
	}

	baseName := strings.TrimSuffix(inputFiles[0].Name, filepath.Ext(inputFiles[0].Name))
	outputName := baseName + "-merged." + outputExt
	fileNameHash := md5.Sum([]byte(outputName))
	fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + "." + outputExt
	outputPath := filepath.Join(outputDir, fileName)

	onProgress := func(progress float64) {
		JobService.UpdateJob(job.ID, entities.Job{
			Progress: progress,
		})
	}

	result, err := FfmpegService.MergeVideos(ctx, structs.MergeOptionsDto{
		Inputs:     inputPaths,
		OutputPath: outputPath,
		OutputExt:  outputExt,
		Encode:     extras.Encode,
		OnProgress: onProgress,
	})
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return err
		}
		updateJobFailed(job.ID, err.Error())
		return err
	}

	err = JobFileDataService.CreateJobFileData(entities.JobFileData{
		JobID:    job.ID,
		Name:     outputName,
		Size:     result.Size,
		Duration: result.Duration,
		Path:     result.Path,
		Type:     enums.JobFileDataTypeOutput,
	})
	if err != nil {
		return fmt.Errorf("[MergeVideoWorker] create output job file data: %w", err)
	}

	_ = totalDuration
	return nil
}

func resolveExtras(job entities.Job) structs.MergeJobExtrasDto {
	if job.Extras == "" {
		return structs.MergeJobExtrasDto{Encode: structs.DefaultMergeEncodeOptions()}
	}
	extras, err := structs.ParseMergeJobExtrasJSON(job.Extras)
	if err != nil {
		return structs.MergeJobExtrasDto{Encode: structs.DefaultMergeEncodeOptions()}
	}
	return extras
}

func updateJobFailed(jobID int, message string) {
	JobService.UpdateJob(jobID, entities.Job{
		Status: enums.StatusFailed,
		Error:  message,
	})
}
