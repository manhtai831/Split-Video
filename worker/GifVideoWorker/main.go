package GifVideoWorker

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
		return errors.New("[GifVideoWorker] error getting job file data: " + err.Error())
	}
	if len(inputFiles) == 0 || inputFiles[0].Path == "" {
		return errors.New("[GifVideoWorker] no input job file data found")
	}
	input := inputFiles[0]

	extras := resolveExtras(job)
	if len(extras.Segments) == 0 {
		return errors.New("[GifVideoWorker] no segments in extras")
	}

	probe, err := FfmpegService.ProbeMedia(ctx, input.Path)
	if err != nil {
		return fmt.Errorf("[GifVideoWorker] probe media: %w", err)
	}

	input.Duration = probe.Duration
	JobFileDataService.UpdateJobFileData(&input)

	width, height, err := structs.ResolveDimensions(extras.Dimension, probe)
	if err != nil {
		updateJobFailed(job.ID, err.Error())
		return err
	}

	for i, seg := range extras.Segments {
		if seg.StartAt+seg.Duration > probe.Duration+0.05 {
			msg := fmt.Sprintf("đoạn %d vượt quá thời lượng video", i+1)
			updateJobFailed(job.ID, msg)
			return errors.New("[GifVideoWorker] " + msg)
		}
	}

	outputFmt := extras.OutputFmt
	if outputFmt == "" {
		outputFmt = "gif"
	}
	quality := structs.ResolveGifQuality(outputFmt, extras.Quality)

	outputDir := filepath.Join("uploads", "output", "gifs", strconv.Itoa(job.ID))
	os.RemoveAll(outputDir)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("[GifVideoWorker] create output dir: %w", err)
	}

	baseName := strings.TrimSuffix(input.Name, filepath.Ext(input.Name))
	totalSegments := len(extras.Segments)

	for i, seg := range extras.Segments {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		segmentIndex := i + 1
		outputName := fmt.Sprintf("%s-%d.%s", baseName, segmentIndex, outputFmt)
		fileNameHash := md5.Sum([]byte(outputName))
		fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + "." + outputFmt
		outputPath := filepath.Join(outputDir, fileName)

		segmentBase := float64(i) / float64(totalSegments)
		onProgress := func(p float64) {
			progress := segmentBase + p/float64(totalSegments)
			JobService.UpdateJob(job.ID, entities.Job{Progress: progress})
		}

		result, err := FfmpegService.CreateAnimatedImage(ctx, structs.GifOptionsDto{
			InputPath:  input.Path,
			OutputPath: outputPath,
			StartAt:    seg.StartAt,
			Duration:   seg.Duration,
			Width:      width,
			Height:     height,
			FPS:        extras.FPS,
			Loop:       extras.Loop,
			OutputFmt:  outputFmt,
			Quality:    quality,
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
			From:     seg.StartAt,
			To:       seg.StartAt + seg.Duration,
		})
		if err != nil {
			return fmt.Errorf("[GifVideoWorker] create output job file data: %w", err)
		}
	}

	return nil
}

func resolveExtras(job entities.Job) structs.GifJobExtrasDto {
	if job.Extras == "" {
		return structs.GifJobExtrasDto{
			OutputFmt: "gif",
			FPS:       10,
			Loop:      true,
		}
	}
	extras, err := structs.ParseGifJobExtrasJSON(job.Extras)
	if err != nil {
		return structs.GifJobExtrasDto{OutputFmt: "gif", FPS: 10, Loop: true}
	}
	return extras
}

func updateJobFailed(jobID int, message string) {
	JobService.UpdateJob(jobID, entities.Job{
		Status: enums.StatusFailed,
		Error:  message,
	})
}
