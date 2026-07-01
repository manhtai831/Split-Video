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
	outputExt := extras.OutputExt
	if outputExt == "" {
		outputExt = "mp4"
	}
	segments, err := processSplit(ctx, job, jobFileDataInput, outputDir, baseFileName, encodeOpts, extras.SplitMode.OrDefault(), extras.SizeLimit, extras.TimeLimit, outputExt)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return err
		}
		updateJobFailed(job.ID, err.Error())
		return err
	}

	outputBaseName := strings.TrimSuffix(jobFileDataInput.Name, filepath.Ext(jobFileDataInput.Path))

	for i, segment := range segments {
		segmentName := outputBaseName + "-" + strconv.Itoa(segment.Index) + "." + outputExt
		segments[i].Name = segmentName
		err = JobFileDataService.CreateJobFileData(entities.JobFileData{
			JobID:    job.ID,
			Name:     segmentName,
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

	if outputExt == "ts" {
		if err := createHLSPlaylist(job, outputDir, baseFileName, outputBaseName, segments); err != nil {
			return err
		}
	}

	return nil
}

func createHLSPlaylist(job entities.Job, outputDir, baseFileName, outputBaseName string, segments []structs.SegmentResultDto) error {
	playlistPath := filepath.Join(outputDir, baseFileName+".m3u8")
	if err := FfmpegService.WriteHLSPlaylist(playlistPath, segments); err != nil {
		return fmt.Errorf("[SplitVideoWorker] create HLS playlist: %w", err)
	}

	stat, err := os.Stat(playlistPath)
	if err != nil {
		return fmt.Errorf("[SplitVideoWorker] stat HLS playlist: %w", err)
	}

	var totalDuration float64
	for _, seg := range segments {
		totalDuration += seg.Duration
	}

	err = JobFileDataService.CreateJobFileData(entities.JobFileData{
		JobID:    job.ID,
		Name:     outputBaseName + ".m3u8",
		Size:     stat.Size(),
		Duration: totalDuration,
		Path:     playlistPath,
		Type:     enums.JobFileDataTypeOutput,
	})
	if err != nil {
		return fmt.Errorf("[SplitVideoWorker] create m3u8 job file data: %w", err)
	}

	return nil
}

func processSplit(
	ctx context.Context,
	job entities.Job,
	jobFileDataInput entities.JobFileData,
	outputDir string,
	baseFileName string,
	encodeOpts structs.FfmpegEncodeOptionsDto,
	splitMode enums.SplitMode,
	sizeLimit int64,
	timeLimit float64,
	outputExt string,
) ([]structs.SegmentResultDto, error) {
	inputPath := jobFileDataInput.Path
	onProgress := func(done structs.SegmentResultDto, totalDuration, encodedDuration float64) {
		JobService.UpdateJob(job.ID, entities.Job{
			Progress: encodedDuration / totalDuration,
		})
	}

	return FfmpegService.Split(ctx, structs.SplitOptionsDto{
		InputPath:  inputPath,
		OutputDir:  outputDir,
		SplitMode:  splitMode,
		SizeLimit:  sizeLimit,
		TimeLimit:  timeLimit,
		OutputExt:  outputExt,
		NamePrefix: baseFileName,
		Encode:     encodeOpts,
		OnProgress: onProgress,
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
