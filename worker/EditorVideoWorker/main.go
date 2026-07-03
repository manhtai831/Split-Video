package EditorVideoWorker

import (
	"app/entities"
	"app/enums"
	"app/services/JobService"
	"app/structs"
	"context"
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

	_, err := structs.ParseEditorJobExtrasJSON(job.Extras)
	if err != nil {
		return err
	}

	if err := JobService.UpdateJob(job.ID, entities.Job{Progress: 1}); err != nil {
		return err
	}

	return nil
}
