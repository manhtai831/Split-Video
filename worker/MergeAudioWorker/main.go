package MergeAudioWorker

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
		return errors.New("[MergeAudioWorker] error getting job file data: " + err.Error())
	}
	if len(inputFiles) < 2 {
		return errors.New("[MergeAudioWorker] merge audio requires at least 2 input files")
	}

	extras := resolveExtras(job)
	outputExt := extras.OutputFormat
	if outputExt == "" {
		outputExt = "mp3"
	}

	outputDir := filepath.Join("uploads", "output", "merge-audio", strconv.Itoa(job.ID))
	os.RemoveAll(outputDir)
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("[MergeAudioWorker] create output dir: %w", err)
	}

	inputPaths := make([]string, len(inputFiles))
	for i, fileData := range inputFiles {
		probe, err := FfmpegService.ProbeMedia(ctx, fileData.Path)
		if err != nil {
			return fmt.Errorf("[MergeAudioWorker] probe %q: %w", fileData.Name, err)
		}
		if probe.AudioCodec == "" {
			return fmt.Errorf("file %q không có track âm thanh", fileData.Name)
		}
		fileData.Duration = probe.Duration
		JobFileDataService.UpdateJobFileData(&fileData)
		inputPaths[i] = fileData.Path
	}

	baseName := strings.TrimSuffix(inputFiles[0].Name, filepath.Ext(inputFiles[0].Name))
	outputName := baseName + "_merged." + outputExt
	fileNameHash := md5.Sum([]byte(outputName))
	fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + "." + outputExt
	outputPath := filepath.Join(outputDir, fileName)

	onProgress := func(progress float64) {
		JobService.UpdateJob(job.ID, entities.Job{Progress: progress})
	}

	result, err := FfmpegService.MergeAudio(ctx, FfmpegService.MergeAudioOptionsDto{
		Inputs:       inputPaths,
		OutputPath:   outputPath,
		OutputFormat: outputExt,
		AudioBitrate: extras.AudioBitrate,
		OnProgress:   onProgress,
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
		return fmt.Errorf("[MergeAudioWorker] create output job file data: %w", err)
	}

	return nil
}

func resolveExtras(job entities.Job) structs.MergeAudioJobExtrasDto {
	if job.Extras == "" {
		return structs.MergeAudioJobExtrasDto{
			OutputFormat: "mp3",
			AudioBitrate: "original",
		}
	}
	extras, err := structs.ParseMergeAudioJobExtrasJSON(job.Extras)
	if err != nil {
		return structs.MergeAudioJobExtrasDto{
			OutputFormat: "mp3",
			AudioBitrate: "original",
		}
	}
	return extras
}

func updateJobFailed(jobID int, message string) {
	JobService.UpdateJob(jobID, entities.Job{
		Status: enums.StatusFailed,
		Error:  message,
	})
}
