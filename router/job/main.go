package job

import (
	"app/entities"
	"app/enums"
	"app/middleware"
	"app/services/JobFileDataService"
	"app/services/JobService"
	"app/worker/channels"
	"net/http"
	"time"
)

func Bootstrap() {
	http.HandleFunc("/job/cancel", middleware.WithUserID(handleCancel))
	http.HandleFunc("/job/retry", middleware.WithUserID(handleRetry))
}

func handleCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	jobIdentifier := r.URL.Query().Get("jobIdentifier")
	if jobIdentifier == "" {
		http.Error(w, "Missing jobIdentifier", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(w, r)
	job, err := JobService.GetJobByIdentifierForUser(jobIdentifier, userID)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	if job.Status == enums.StatusCompleted || job.Status == enums.StatusFailed || job.Status == enums.StatusCancelled {
		http.Error(w, "Job cannot be cancelled", http.StatusConflict)
		return
	}

	channels.JobManagerInstance.JobMutex.Lock()
	cancel, ok := channels.JobManagerInstance.JobCancelMap[jobIdentifier]
	channels.JobManagerInstance.JobMutex.Unlock()

	if ok {
		cancel()
	} else if job.Status == enums.StatusPending {
		err = JobService.UpdateJob(job.ID, entities.Job{
			Status:     enums.StatusCancelled,
			FinishedAt: time.Now(),
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func handleRetry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	jobIdentifier := r.URL.Query().Get("jobIdentifier")
	if jobIdentifier == "" {
		http.Error(w, "Missing jobIdentifier", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(w, r)
	job, err := JobService.GetJobByIdentifierForUser(jobIdentifier, userID)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	if job.Status != enums.StatusFailed {
		http.Error(w, "Job cannot be retried", http.StatusConflict)
		return
	}

	if err := JobFileDataService.DeleteOutputFilesByJobId(job.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := JobService.ResetJobForRetry(job.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	channels.JobChannel <- entities.Job{ID: job.ID}
	w.WriteHeader(http.StatusNoContent)
}
