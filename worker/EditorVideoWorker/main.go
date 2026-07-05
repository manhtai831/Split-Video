package EditorVideoWorker

import (
	"app/entities"
	"app/enums"
	"app/services/EditorRasterService"
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
	"time"
)

func Process(job entities.Job, ctx context.Context) error {
	if job.Status == enums.StatusCompleted || job.Status == enums.StatusFailed || job.Status == enums.StatusCancelled {
		return nil
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	extras, err := resolveExtras(job)
	if err != nil {
		return err
	}

	inputFiles, err := JobFileDataService.GetJobFileDataByJobId(job.ID, enums.JobFileDataTypeInput)
	if err != nil {
		return fmt.Errorf("[EditorVideoWorker] get input files: %w", err)
	}

	filePaths := make(map[int]string, len(inputFiles))
	for _, f := range inputFiles {
		filePaths[f.ID] = f.Path
	}

	layers, err := structs.ParseEditorLayers(extras.Layers)
	if err != nil {
		return fmt.Errorf("[EditorVideoWorker] parse layers: %w", err)
	}
	sortedLayers := structs.SortLayersByZIndex(layers)

	outputExt := extras.OutputExt
	if outputExt == "" {
		outputExt = "mp4"
	}

	outputDir := filepath.Join("uploads", "output", "editor", strconv.Itoa(job.ID))
	os.RemoveAll(outputDir)
	if err := JobFileDataService.DeleteOutputFilesByJobId(job.ID); err != nil {
		return fmt.Errorf("[EditorVideoWorker] delete old output rows: %w", err)
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("[EditorVideoWorker] create output dir: %w", err)
	}

	tempDir := filepath.Join("uploads", "tmp", "editor", strconv.Itoa(job.ID))
	os.RemoveAll(tempDir)

	onProgress := func(p float64) {
		JobService.UpdateJob(job.ID, entities.Job{Progress: p})
	}
	onProgress(0.05)

	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	rasterPaths, err := EditorRasterService.RenderLayers(ctx, EditorRasterService.RenderOptions{
		JobID:   job.ID,
		Extras:  extras,
		Layers:  sortedLayers,
		TempDir: tempDir,
	})
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return err
		}
		updateJobFailed(job.ID, err.Error())
		return err
	}

	onProgress(0.2)

	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	outputName := fmt.Sprintf("editor-%d.%s", job.ID, outputExt)
	fileNameHash := md5.Sum([]byte(outputName))
	fileName := hex.EncodeToString(fileNameHash[:]) + strconv.FormatInt(time.Now().UnixNano(), 10) + "." + outputExt
	outputPath := filepath.Join(outputDir, fileName)

	result, err := FfmpegService.RenderEditorProject(ctx, FfmpegService.EditorRenderOptions{
		Extras:      extras,
		Layers:      sortedLayers,
		FilePaths:   filePaths,
		RasterPaths: rasterPaths,
		OutputPath:  outputPath,
		TempDir:     tempDir,
		Encode:      extras.Encode,
		OnProgress: func(p float64) {
			onProgress(0.2 + p*0.8)
		},
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
		return fmt.Errorf("[EditorVideoWorker] create output job file data: %w", err)
	}

	return nil
}

func resolveExtras(job entities.Job) (structs.EditorJobExtrasDto, error) {
	dto, err := structs.ParseEditorJobExtrasJSON(job.Extras)
	if err != nil {
		return structs.EditorJobExtrasDto{}, err
	}

	encode := dto.Encode
	if encode.VideoCodec == "" {
		encode = structs.DefaultEditorEncodeOptions()
	}
	dto.Encode = encode

	if dto.OutputExt == "" {
		dto.OutputExt = "mp4"
	}

	return dto, nil
}

func updateJobFailed(jobID int, message string) {
	JobService.UpdateJob(jobID, entities.Job{
		Status: enums.StatusFailed,
		Error:  message,
	})
}
