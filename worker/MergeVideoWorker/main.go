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
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("[MergeVideoWorker] create output dir: %w", err)
	}

	probes := make([]structs.MediaProbeDto, len(inputFiles))
	for i, fileData := range inputFiles {
		probe, err := FfmpegService.ProbeMedia(ctx, fileData.Path)
		if err != nil {
			return fmt.Errorf("[MergeVideoWorker] probe %q: %w", fileData.Name, err)
		}
		probes[i] = probe
	}

	canvasW, canvasH := FfmpegService.ComputeMergeCanvas(probes, extras.Encode.Scale)

	hasImages := false
	var tempClips []string
	inputPaths := make([]string, len(inputFiles))

	for i, fileData := range inputFiles {
		meta := itemMetaForIndex(extras.ItemsMeta, fileData.SortOrder)
		kind := meta.Kind
		if kind == "" {
			kind = "video"
		}

		if kind == "image" || kind == "gif" {
			hasImages = true
			tempPath := filepath.Join(outputDir, fmt.Sprintf("_img_%d.mp4", i))
			err := FfmpegService.ImageToVideoClip(ctx, FfmpegService.ImageClipOptions{
				InputPath:    fileData.Path,
				OutputPath:   tempPath,
				Kind:         kind,
				HoldDuration: meta.HoldDuration,
				Encode:       extras.Encode,
				CanvasW:      canvasW,
				CanvasH:      canvasH,
			})
			if err != nil {
				return fmt.Errorf("[MergeVideoWorker] convert image %q: %w", fileData.Name, err)
			}
			tempClips = append(tempClips, tempPath)
			inputPaths[i] = tempPath

			duration, err := FfmpegService.GetDuration(ctx, tempPath)
			if err != nil {
				return fmt.Errorf("[MergeVideoWorker] probe converted clip %q: %w", fileData.Name, err)
			}
			fileData.Duration = duration
			JobFileDataService.UpdateJobFileData(&fileData)
		} else {
			duration, err := FfmpegService.GetDuration(ctx, fileData.Path)
			if err != nil {
				return fmt.Errorf("[MergeVideoWorker] error getting duration for %q: %w", fileData.Name, err)
			}
			fileData.Duration = duration
			JobFileDataService.UpdateJobFileData(&fileData)
			inputPaths[i] = fileData.Path
		}
	}

	defer func() {
		for _, p := range tempClips {
			os.Remove(p)
		}
	}()

	encode := extras.Encode
	if hasImages {
		encode = forceReencodeForImages(encode)
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
		Encode:     encode,
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

	return nil
}

func itemMetaForIndex(items []structs.MergeItemMetaDto, index int) structs.MergeItemMetaDto {
	if index >= 0 && index < len(items) {
		return items[index]
	}
	return structs.MergeItemMetaDto{Kind: "video"}
}

func forceReencodeForImages(enc structs.FfmpegEncodeOptionsDto) structs.FfmpegEncodeOptionsDto {
	out := enc
	if out.VideoCodec == "" || out.VideoCodec == "copy" {
		out.VideoCodec = "libx264"
		if out.PixelFormat == "" {
			out.PixelFormat = "yuv420p"
		}
		if out.CRF == 0 && out.VideoBitrate == "" {
			out.CRF = 23
		}
	}
	if out.Preset == "" {
		out.Preset = "medium"
	}
	return out
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
