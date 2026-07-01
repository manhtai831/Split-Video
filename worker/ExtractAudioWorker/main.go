package ExtractAudioWorker

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
		return errors.New("[ExtractAudioWorker] error getting job file data: " + err.Error())
	}
	if len(inputFiles) == 0 || inputFiles[0].Path == "" {
		return errors.New("[ExtractAudioWorker] no input job file data found")
	}
	input := inputFiles[0]

	extras := resolveExtras(job)

	probe, err := FfmpegService.ProbeMedia(ctx, input.Path)
	if err != nil {
		return fmt.Errorf("[ExtractAudioWorker] probe media: %w", err)
	}
	if probe.AudioCodec == "" {
		return errors.New("video không có track âm thanh")
	}

	input.Duration = probe.Duration
	JobFileDataService.UpdateJobFileData(&input)

	outputFormat := extras.OutputFormat
	if outputFormat == "" {
		outputFormat = "mp3"
	}

	outputDir := filepath.Join("uploads", "output", "extract-audio", strconv.Itoa(job.ID))
	os.RemoveAll(outputDir)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("[ExtractAudioWorker] create output dir: %w", err)
	}

	baseName := strings.TrimSuffix(input.Name, filepath.Ext(input.Name))
	outputName := baseName + "." + outputFormat
	fileNameHash := md5.Sum([]byte(outputName))
	fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + "." + outputFormat
	outputPath := filepath.Join(outputDir, fileName)

	metadata := extras.Metadata
	metadata.Title = baseName

	onProgress := func(p float64) {
		JobService.UpdateJob(job.ID, entities.Job{Progress: p})
	}

	result, err := FfmpegService.ExtractAudio(ctx, FfmpegService.ExtractAudioOptionsDto{
		InputPath:          input.Path,
		OutputPath:         outputPath,
		OutputFormat:       outputFormat,
		AudioBitrate:       extras.AudioBitrate,
		Volume:             extras.Volume,
		Speed:              extras.Speed,
		Metadata:           metadata,
		SourceAudioCodec:   probe.AudioCodec,
		SourceAudioBitrate: probe.AudioBitrate,
		OnProgress:         onProgress,
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
		return fmt.Errorf("[ExtractAudioWorker] create output job file data: %w", err)
	}

	return nil
}

func resolveExtras(job entities.Job) structs.ExtractAudioJobExtrasDto {
	if job.Extras == "" {
		return structs.ExtractAudioJobExtrasDto{
			OutputFormat: "mp3",
			AudioBitrate: "original",
			Volume:       100,
			Speed:        1,
		}
	}
	extras, err := structs.ParseExtractAudioJobExtrasJSON(job.Extras)
	if err != nil {
		return structs.ExtractAudioJobExtrasDto{
			OutputFormat: "mp3",
			AudioBitrate: "original",
			Volume:       100,
			Speed:        1,
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
