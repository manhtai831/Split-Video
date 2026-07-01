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
		EncodeSummary: buildEncodeSummary(job.Type, job.Extras),
		Error:         job.Error,
		CreatedAt:     timePtr(job.CreatedAt),
		StartedAt:     timePtr(job.StartedAt),
		FinishedAt:    timePtr(job.FinishedAt),
		DownloadAt:    timePtr(job.DownloadAt),
		OutputFiles:   make([]structs.JobOutputFileDto, 0, len(outputFiles)),
	}

	if len(inputFiles) > 0 {
		if job.Type == enums.JobTypeMerge {
			dto.FileName = buildMergeFileName(inputFiles, job.Extras)
			var totalSize int64
			var totalDuration float64
			for _, f := range inputFiles {
				totalSize += f.Size
				totalDuration += f.Duration
			}
			dto.FileSize = totalSize
			dto.Duration = totalDuration
		} else {
			dto.FileName = inputFiles[0].Name
			dto.FileSize = inputFiles[0].Size
			dto.Duration = inputFiles[0].Duration
		}
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

func buildEncodeSummary(jobType enums.JobType, extrasJSON string) string {
	if extrasJSON == "" {
		return ""
	}

	switch jobType {
	case enums.JobTypeMerge:
		extras, err := structs.ParseMergeJobExtrasJSON(extrasJSON)
		if err != nil {
			return ""
		}
		return buildEncodeSummaryFromOptions(extras.Encode)
	case enums.JobTypeGif:
		extras, err := structs.ParseGifJobExtrasJSON(extrasJSON)
		if err != nil {
			return ""
		}
		return buildGifEncodeSummary(extras)
	default:
		extras, err := structs.ParseSplitJobExtrasJSON(extrasJSON)
		if err != nil {
			return ""
		}
		return buildEncodeSummaryFromOptions(extras.Encode)
	}
}

func buildGifEncodeSummary(extras structs.GifJobExtrasDto) string {
	parts := []string{
		strings.ToUpper(extras.OutputFmt),
		fmt.Sprintf("%d×%d", extras.Dimension.Width, extras.Dimension.Height),
		fmt.Sprintf("%d fps", extras.FPS),
	}
	if extras.Quality.Preset != "" {
		parts = append(parts, extras.Quality.Preset)
	}
	if len(extras.Segments) > 1 {
		parts = append(parts, fmt.Sprintf("%d đoạn", len(extras.Segments)))
	}
	return strings.Join(parts, " · ")
}

func buildEncodeSummaryFromOptions(enc structs.FfmpegEncodeOptionsDto) string {
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

func buildMergeFileName(inputFiles []entities.JobFileData, extrasJSON string) string {
	if len(inputFiles) == 0 {
		return ""
	}

	itemsMeta := []structs.MergeItemMetaDto{}
	if extrasJSON != "" {
		if extras, err := structs.ParseMergeJobExtrasJSON(extrasJSON); err == nil {
			itemsMeta = extras.ItemsMeta
		}
	}

	labels := make([]string, len(inputFiles))
	for i, f := range inputFiles {
		labels[i] = mergeInputLabel(f, itemMetaAt(itemsMeta, i))
	}

	if len(labels) == 1 {
		return labels[0]
	}
	if len(labels) == 2 {
		return labels[0] + " → " + labels[1]
	}
	return labels[0] + " → " + labels[len(labels)-1] + " (" + strconv.Itoa(len(labels)) + " clip)"
}

func itemMetaAt(items []structs.MergeItemMetaDto, index int) structs.MergeItemMetaDto {
	if index >= 0 && index < len(items) {
		return items[index]
	}
	return structs.MergeItemMetaDto{Kind: "video"}
}

func mergeInputLabel(f entities.JobFileData, meta structs.MergeItemMetaDto) string {
	switch meta.Kind {
	case "image":
		dur := meta.HoldDuration
		if dur <= 0 {
			dur = 2
		}
		if dur == float64(int(dur)) {
			return fmt.Sprintf("ảnh (%.0fs)", dur)
		}
		return fmt.Sprintf("ảnh (%.1fs)", dur)
	case "gif":
		if meta.HoldDuration <= 0 {
			if f.Duration > 0 {
				return fmt.Sprintf("%s (gốc)", f.Name)
			}
			return f.Name + " (gốc)"
		}
		return fmt.Sprintf("%s (%.1fs)", f.Name, meta.HoldDuration)
	default:
		return f.Name
	}
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
