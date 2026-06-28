package JobPresenterService

import (
	"app/entities"
	"app/enums"
	"app/services/JobFileDataService"
	"app/structs"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func timePtr(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

func ToJobItemDto(job entities.Job) (structs.JobItemDto, error) {
	inputFiles, err := JobFileDataService.GetJobFileDataByJobId(job.ID, enums.JobFileDataTypeInput)
	if err != nil {
		return structs.JobItemDto{}, err
	}

	outputFiles, err := JobFileDataService.GetJobFileDataByJobId(job.ID, enums.JobFileDataTypeOutput)
	if err != nil {
		return structs.JobItemDto{}, err
	}

	dto := structs.JobItemDto{
		Identifier:    job.Identifier,
		Type:          string(job.Type),
		Status:        string(job.Status),
		Progress:      job.Progress,
		EncodeSummary: buildEncodeSummary(job.Extras),
		Error:         job.Error,
		CreatedAt:     timePtr(job.CreatedAt),
		StartedAt:     timePtr(job.StartedAt),
		FinishedAt:    timePtr(job.FinishedAt),
		OutputFiles:   make([]structs.JobOutputFileDto, 0, len(outputFiles)),
	}

	if len(inputFiles) > 0 {
		dto.FileName = inputFiles[0].Name
		dto.FileSize = inputFiles[0].Size
		dto.Duration = inputFiles[0].Duration
	}

	for _, f := range outputFiles {
		dto.OutputFiles = append(dto.OutputFiles, structs.JobOutputFileDto{
			ID:          f.ID,
			Name:        f.Name,
			Size:        f.Size,
			DownloadURL: fmt.Sprintf("/api/jobs/%s/files/%d/download", job.Identifier, f.ID),
		})
	}

	if len(dto.OutputFiles) == 1 {
		url := dto.OutputFiles[0].DownloadURL
		dto.DownloadURL = &url
	}

	return dto, nil
}

func ToJobItemDtos(jobs []entities.Job) ([]structs.JobItemDto, error) {
	items := make([]structs.JobItemDto, 0, len(jobs))
	for _, job := range jobs {
		dto, err := ToJobItemDto(job)
		if err != nil {
			return nil, err
		}
		items = append(items, dto)
	}
	return items, nil
}

func buildEncodeSummary(extrasJSON string) string {
	if extrasJSON == "" {
		return ""
	}
	extras, err := structs.ParseSplitJobExtrasJSON(extrasJSON)
	if err != nil {
		return ""
	}
	enc := extras.Encode

	if enc.VideoCodec == "copy" {
		audio := "Copy audio"
		if enc.Mute {
			audio = "Mute"
		} else if enc.AudioCodec == "copy" {
			audio = "Copy audio"
		} else if enc.AudioCodec != "" {
			audio = strings.ToUpper(enc.AudioCodec)
		}
		return "keep · " + audio
	}

	var parts []string
	if enc.Scale != "" {
		parts = append(parts, scaleLabel(enc.Scale))
	}
	if enc.CRF > 0 {
		parts = append(parts, "CRF "+strconv.Itoa(enc.CRF))
	}
	if enc.Preset != "" {
		parts = append(parts, enc.Preset)
	}
	return strings.Join(parts, " · ")
}

func scaleLabel(scale string) string {
	if scale == "" {
		return ""
	}
	if idx := strings.Index(scale, ":"); idx > 0 {
		return strings.ToUpper(scale[:idx]) + "P"
	}
	return strings.ToUpper(scale) + "P"
}
