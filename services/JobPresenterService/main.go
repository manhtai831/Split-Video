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
		if job.Type == enums.JobTypeMerge || job.Type == enums.JobTypeMergeAudio {
			if job.Type == enums.JobTypeMerge {
				dto.FileName = buildMergeFileName(inputFiles, job.Extras)
			} else {
				dto.FileName = buildMergeAudioFileName(inputFiles)
			}
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

	if job.Type == enums.JobTypeEditor {
		dto.FileName = dto.EncodeSummary
		if dto.FileName == "" {
			dto.FileName = "Editor project"
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

func ToAdminJobItemDtos(jobs []entities.Job) ([]structs.AdminJobItemDto, error) {
	items := make([]structs.AdminJobItemDto, 0, len(jobs))
	for _, job := range jobs {
		dto, err := ToJobItemDto(job)
		if err != nil {
			return nil, err
		}
		items = append(items, structs.AdminJobItemDto{
			JobItemDto: dto,
			UserID:     job.UserID,
		})
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
	case enums.JobTypeExtractAudio:
		extras, err := structs.ParseExtractAudioJobExtrasJSON(extrasJSON)
		if err != nil {
			return ""
		}
		return buildExtractAudioEncodeSummary(extras)
	case enums.JobTypeTrimAudio:
		extras, err := structs.ParseTrimAudioJobExtrasJSON(extrasJSON)
		if err != nil {
			return ""
		}
		return buildTrimAudioEncodeSummary(extras)
	case enums.JobTypeMergeAudio:
		extras, err := structs.ParseMergeAudioJobExtrasJSON(extrasJSON)
		if err != nil {
			return ""
		}
		return buildMergeAudioEncodeSummary(extras)
	case enums.JobTypeEditor:
		extras, err := structs.ParseEditorJobExtrasJSON(extrasJSON)
		if err != nil {
			return ""
		}
		return buildEditorEncodeSummary(extras)
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

func buildEditorEncodeSummary(extras structs.EditorJobExtrasDto) string {
	parts := []string{
		fmt.Sprintf("%d×%d", extras.Frame.Width, extras.Frame.Height),
	}
	if extras.FramePreset != "" {
		parts = append(parts, extras.FramePreset)
	}
	layerCount := len(extras.Layers)
	if layerCount > 0 {
		parts = append(parts, fmt.Sprintf("%d layers", layerCount))
	}
	return strings.Join(parts, " · ")
}

func buildExtractAudioEncodeSummary(extras structs.ExtractAudioJobExtrasDto) string {
	parts := []string{strings.ToUpper(extras.OutputFormat)}
	if extras.AudioBitrate != "" {
		if extras.AudioBitrate == "original" {
			parts = append(parts, "Original")
		} else {
			parts = append(parts, extras.AudioBitrate)
		}
	}
	if extras.Speed != 0 && extras.Speed != 1 {
		parts = append(parts, fmt.Sprintf("%.2g×", extras.Speed))
	}
	if extras.Volume != 0 && extras.Volume != 100 {
		parts = append(parts, fmt.Sprintf("Vol %.0f%%", extras.Volume))
	}
	if extras.Metadata.Artist != "" {
		parts = append(parts, extras.Metadata.Artist)
	}
	return strings.Join(parts, " · ")
}

func buildTrimAudioEncodeSummary(extras structs.TrimAudioJobExtrasDto) string {
	parts := []string{
		fmt.Sprintf("%ss–%ss", formatTrimSeconds(extras.Start), formatTrimSeconds(extras.End)),
	}
	if extras.FadeIn > 0 || extras.FadeOut > 0 {
		if extras.FadeIn == extras.FadeOut {
			parts = append(parts, fmt.Sprintf("fade %ss", formatTrimSeconds(extras.FadeIn)))
		} else {
			parts = append(parts, fmt.Sprintf(
				"fade in %ss / out %ss",
				formatTrimSeconds(extras.FadeIn),
				formatTrimSeconds(extras.FadeOut),
			))
		}
	}
	return strings.Join(parts, " · ")
}

func formatTrimSeconds(v float64) string {
	s := strconv.FormatFloat(v, 'f', 3, 64)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	if s == "" {
		return "0"
	}
	return s
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

func buildMergeAudioFileName(inputFiles []entities.JobFileData) string {
	if len(inputFiles) == 0 {
		return ""
	}
	if len(inputFiles) == 1 {
		return inputFiles[0].Name
	}
	if len(inputFiles) == 2 {
		return inputFiles[0].Name + " → " + inputFiles[1].Name
	}
	return inputFiles[0].Name + " → " + inputFiles[len(inputFiles)-1].Name +
		" (" + strconv.Itoa(len(inputFiles)) + " file)"
}

func buildMergeAudioEncodeSummary(extras structs.MergeAudioJobExtrasDto) string {
	parts := []string{strings.ToUpper(extras.OutputFormat)}
	if extras.OutputFormat != "wav" && extras.OutputFormat != "flac" {
		if extras.AudioBitrate == "" || extras.AudioBitrate == "original" {
			parts = append(parts, "Original")
		} else {
			parts = append(parts, extras.AudioBitrate)
		}
	}
	return strings.Join(parts, " · ")
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
