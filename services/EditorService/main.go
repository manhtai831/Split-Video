package EditorService

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
	"app/services/FfmpegService"
	"app/services/JobFileDataService"
	"app/services/JobService"
	"app/structs"
	"app/worker/channels"
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type UploadedFile struct {
	ClientKey string
	Path      string
	Name      string
}

var (
	ErrJobNotFound      = errors.New("job not found")
	ErrInvalidStatus    = errors.New("invalid job status for this operation")
	ErrNotEditorJob     = errors.New("not an editor job")
)

func CreateDraft(userID string, extrasJSON string, files []UploadedFile) (entities.Job, error) {
	extras, err := structs.ParseEditorJobExtrasJSON(extrasJSON)
	if err != nil {
		return entities.Job{}, err
	}

	job := entities.Job{
		Identifier: uuid.New().String(),
		Status:     enums.StatusDraft,
		Type:       enums.JobTypeEditor,
		Extras:     extrasJSON,
		UserID:     userID,
	}

	if err := Global.DB.Create(&job).Error; err != nil {
		return entities.Job{}, err
	}

	clientKeyToFileID, err := saveInputFiles(job.ID, files)
	if err != nil {
		return entities.Job{}, err
	}

	extras.ResolveLayerFiles(job.Identifier, clientKeyToFileID)
	extras.SanitizeLayersForStorage()
	storedJSON, err := extras.ToJSON()
	if err != nil {
		return entities.Job{}, err
	}

	if err := JobService.UpdateJob(job.ID, entities.Job{Extras: storedJSON}); err != nil {
		return entities.Job{}, err
	}
	job.Extras = storedJSON

	return job, nil
}

func UpdateDraft(identifier, userID, extrasJSON string, files []UploadedFile) (entities.Job, error) {
	job, err := getEditorJobEntity(identifier, userID)
	if err != nil {
		return entities.Job{}, err
	}

	if job.Status == enums.StatusProcessing {
		return entities.Job{}, ErrInvalidStatus
	}

	extras, err := structs.ParseEditorJobExtrasJSON(extrasJSON)
	if err != nil {
		return entities.Job{}, err
	}

	clientKeyToFileID, err := saveInputFiles(job.ID, files)
	if err != nil {
		return entities.Job{}, err
	}

	extras.ResolveLayerFiles(job.Identifier, clientKeyToFileID)
	extras.SanitizeLayersForStorage()
	storedJSON, err := extras.ToJSON()
	if err != nil {
		return entities.Job{}, err
	}

	if err := JobService.UpdateJob(job.ID, entities.Job{
		Status: enums.StatusDraft,
		Extras: storedJSON,
	}); err != nil {
		return entities.Job{}, err
	}

	job.Status = enums.StatusDraft
	job.Extras = storedJSON
	return job, nil
}

func GetEditorJob(identifier, userID string) (structs.EditorJobResponseDto, error) {
	job, err := getEditorJobEntity(identifier, userID)
	if err != nil {
		return structs.EditorJobResponseDto{}, err
	}

	extras, err := structs.ParseEditorJobExtrasJSON(job.Extras)
	if err != nil {
		return structs.EditorJobResponseDto{}, err
	}

	inputFiles, err := JobFileDataService.GetJobFileDataByJobId(job.ID, enums.JobFileDataTypeInput)
	if err != nil {
		return structs.EditorJobResponseDto{}, err
	}

	files := make([]structs.EditorInputFileDto, 0, len(inputFiles))
	for _, f := range inputFiles {
		files = append(files, structs.EditorInputFileDto{
			ID:       f.ID,
			Name:     f.Name,
			Size:     f.Size,
			Duration: f.Duration,
		})
	}

	return structs.EditorJobResponseDto{
		Identifier:  job.Identifier,
		Status:      string(job.Status),
		Frame:       extras.Frame,
		FramePreset: extras.FramePreset,
		Duration:    extras.Duration,
		Layers:      extras.Layers,
		Files:       files,
	}, nil
}

func DuplicateJob(identifier, userID string) (entities.Job, error) {
	source, err := getEditorJobEntity(identifier, userID)
	if err != nil {
		return entities.Job{}, err
	}

	newJob := entities.Job{
		Identifier: uuid.New().String(),
		Status:     enums.StatusDraft,
		Type:       enums.JobTypeEditor,
		Extras:     source.Extras,
		UserID:     userID,
	}

	if err := Global.DB.Create(&newJob).Error; err != nil {
		return entities.Job{}, err
	}

	inputFiles, err := JobFileDataService.GetJobFileDataByJobId(source.ID, enums.JobFileDataTypeInput)
	if err != nil {
		return entities.Job{}, err
	}

	newInputFiles := make([]entities.JobFileData, 0, len(inputFiles))
	for _, f := range inputFiles {
		clone := entities.JobFileData{
			JobID:     newJob.ID,
			Name:      f.Name,
			Size:      f.Size,
			Duration:  f.Duration,
			Path:      f.Path,
			Type:      enums.JobFileDataTypeInput,
			SortOrder: f.SortOrder,
		}
		if err := Global.DB.Create(&clone).Error; err != nil {
			return entities.Job{}, err
		}
		newInputFiles = append(newInputFiles, clone)
	}

	extras, err := structs.ParseEditorJobExtrasJSON(newJob.Extras)
	if err != nil {
		return entities.Job{}, err
	}

	oldToNew := make(map[int]int, len(inputFiles))
	for i, oldF := range inputFiles {
		if i < len(newInputFiles) {
			oldToNew[oldF.ID] = newInputFiles[i].ID
		}
	}
	remapLayerFileIDs(&extras, oldToNew, newJob.Identifier)
	extras.SanitizeLayersForStorage()
	storedJSON, err := extras.ToJSON()
	if err != nil {
		return entities.Job{}, err
	}

	if err := JobService.UpdateJob(newJob.ID, entities.Job{Extras: storedJSON}); err != nil {
		return entities.Job{}, err
	}
	newJob.Extras = storedJSON

	return newJob, nil
}

func PublishJob(identifier, userID string) (entities.Job, error) {
	job, err := getEditorJobEntity(identifier, userID)
	if err != nil {
		return entities.Job{}, err
	}

	if job.Status != enums.StatusDraft {
		return entities.Job{}, ErrInvalidStatus
	}

	if err := JobService.UpdateJob(job.ID, entities.Job{
		Status: enums.StatusPending,
	}); err != nil {
		return entities.Job{}, err
	}

	job.Status = enums.StatusPending
	return job, nil
}

func RevertToDraft(identifier, userID string) error {
	job, err := getEditorJobEntity(identifier, userID)
	if err != nil {
		return err
	}

	if job.Status != enums.StatusPending && job.Status != enums.StatusProcessing {
		return ErrInvalidStatus
	}

	if err := JobFileDataService.DeleteOutputFilesByJobId(job.ID); err != nil {
		return err
	}

	if err := JobService.UpdateJob(job.ID, entities.Job{
		Status:     enums.StatusDraft,
		Progress:   0,
		Error:      "",
		FinishedAt: time.Time{},
	}); err != nil {
		return err
	}

	if job.Status == enums.StatusProcessing {
		channels.JobManagerInstance.JobMutex.Lock()
		cancel, ok := channels.JobManagerInstance.JobCancelMap[identifier]
		channels.JobManagerInstance.JobMutex.Unlock()
		if ok {
			cancel()
		}
	}

	return nil
}

func getEditorJobEntity(identifier, userID string) (entities.Job, error) {
	job, err := JobService.GetJobByIdentifierForUser(identifier, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return entities.Job{}, ErrJobNotFound
		}
		return entities.Job{}, err
	}
	if job.Type != enums.JobTypeEditor {
		return entities.Job{}, ErrNotEditorJob
	}
	return job, nil
}

func saveInputFiles(jobID int, files []UploadedFile) (map[string]int, error) {
	clientKeyToFileID := make(map[string]int)
	ctx := context.Background()

	existing, err := JobFileDataService.GetJobFileDataByJobId(jobID, enums.JobFileDataTypeInput)
	if err != nil {
		return nil, err
	}
	sortOrder := len(existing)

	for _, f := range files {
		fileStat, err := os.Stat(f.Path)
		if err != nil {
			return nil, err
		}

		duration, _ := FfmpegService.GetDuration(ctx, f.Path)

		row := entities.JobFileData{
			JobID:     jobID,
			Name:      f.Name,
			Size:      fileStat.Size(),
			Duration:  duration,
			Path:      f.Path,
			Type:      enums.JobFileDataTypeInput,
			SortOrder: sortOrder,
		}
		if err := Global.DB.Create(&row).Error; err != nil {
			return nil, err
		}
		clientKeyToFileID[f.ClientKey] = row.ID
		sortOrder++
	}

	return clientKeyToFileID, nil
}

func remapLayerFileIDs(extras *structs.EditorJobExtrasDto, oldToNew map[int]int, identifier string) {
	for i, layer := range extras.Layers {
		var oldID int
		switch v := layer["fileId"].(type) {
		case float64:
			oldID = int(v)
		case int:
			oldID = v
		}
		if oldID > 0 {
			if newID, ok := oldToNew[oldID]; ok {
				layer["fileId"] = newID
				layer["mediaUrl"] = fmt.Sprintf("/api/jobs/%s/files/%d/download", identifier, newID)
			}
		}
		extras.Layers[i] = layer
	}
}
