package TrimAudioWorker

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
		return errors.New("[TrimAudioWorker] error getting job file data: " + err.Error())
	}
	if len(inputFiles) == 0 || inputFiles[0].Path == "" {
		return errors.New("[TrimAudioWorker] no input job file data found")
	}
	input := inputFiles[0]

	extras := resolveExtras(job)

	probe, err := FfmpegService.ProbeMedia(ctx, input.Path)
	if err != nil {
		return fmt.Errorf("[TrimAudioWorker] probe media: %w", err)
	}
	if probe.AudioCodec == "" {
		return errors.New("file không có track âm thanh")
	}
	if extras.End > probe.Duration && probe.Duration > 0 {
		return fmt.Errorf("end (%.3f) vượt quá thời lượng file (%.3f)", extras.End, probe.Duration)
	}

	input.Duration = probe.Duration
	JobFileDataService.UpdateJobFileData(&input)

	ext := strings.ToLower(filepath.Ext(input.Name))
	if ext == "" {
		ext = strings.ToLower(filepath.Ext(input.Path))
	}
	if ext == "" {
		ext = ".mp3"
	}

	outputDir := filepath.Join("uploads", "output", "trim-audio", strconv.Itoa(job.ID))
	os.RemoveAll(outputDir)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("[TrimAudioWorker] create output dir: %w", err)
	}

	baseName := strings.TrimSuffix(input.Name, filepath.Ext(input.Name))
	outputName := baseName + "_trimmed" + ext
	fileNameHash := md5.Sum([]byte(outputName))
	fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + ext
	outputPath := filepath.Join(outputDir, fileName)

	onProgress := func(p float64) {
		JobService.UpdateJob(job.ID, entities.Job{Progress: p})
	}

	result, err := FfmpegService.TrimAudio(ctx, FfmpegService.TrimAudioOptionsDto{
		InputPath:        input.Path,
		OutputPath:       outputPath,
		Start:            extras.Start,
		End:              extras.End,
		FadeIn:           extras.FadeIn,
		FadeOut:          extras.FadeOut,
		SourceAudioCodec: probe.AudioCodec,
		OnProgress:       onProgress,
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
		return fmt.Errorf("[TrimAudioWorker] create output job file data: %w", err)
	}

	return nil
}

func resolveExtras(job entities.Job) structs.TrimAudioJobExtrasDto {
	if job.Extras == "" {
		return structs.TrimAudioJobExtrasDto{}
	}
	extras, err := structs.ParseTrimAudioJobExtrasJSON(job.Extras)
	if err != nil {
		return structs.TrimAudioJobExtrasDto{}
	}
	return extras
}

func updateJobFailed(jobID int, message string) {
	JobService.UpdateJob(jobID, entities.Job{
		Status: enums.StatusFailed,
		Error:  message,
	})
}
