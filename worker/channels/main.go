package channels

import (
	"app/entities"
	"app/enums"
	"app/services/JobService"
	"app/worker/EditorVideoWorker"
	"app/worker/ExtractAudioWorker"
	"app/worker/GifVideoWorker"
	"app/worker/MergeVideoWorker"
	"app/worker/SplitVideoWorker"
	"app/worker/TrimAudioWorker"
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

type JobManager struct {
	JobCancelMap map[string]context.CancelFunc
	JobMutex     sync.Mutex
}

var JobChannel chan entities.Job
var JobManagerInstance JobManager

func Initialize() {
	JobManagerInstance = JobManager{
		JobCancelMap: make(map[string]context.CancelFunc),
	}
	JobChannel = make(chan entities.Job)
	for i := 0; i < 4; i++ {
		go worker(i)
	}

	jobs, err := JobService.GetAllJobs()
	if err != nil {
		fmt.Println("Error getting jobs:", err)
		return
	}
	for _, job := range jobs {
		JobChannel <- job
	}
}

func worker(id int) {
	for job := range JobChannel {
		processJob(job)
	}
}

func processJob(job entities.Job) {
	fmt.Printf("Worker processing job: %d\n", job.ID)

	current, err := JobService.GetJobById(job.ID)
	if err != nil {
		fmt.Printf("Error getting job: %v\n", err)
		return
	}
	if current.Status != enums.StatusPending {
		fmt.Printf("Skipping job %d with status %s\n", job.ID, current.Status)
		return
	}

	JobService.UpdateJob(job.ID, entities.Job{
		Status:    enums.StatusProcessing,
		StartedAt: time.Now(),
	})

	job, err = JobService.GetJobById(job.ID)
	if err != nil {
		fmt.Printf("Error getting job: %v\n", err)
		return
	}
	err = nil

	switch job.Type {
	case enums.JobTypeSplit:
		context, cancel := context.WithCancel(context.Background())

		JobManagerInstance.JobMutex.Lock()
		JobManagerInstance.JobCancelMap[job.Identifier] = cancel
		JobManagerInstance.JobMutex.Unlock()

		err = SplitVideoWorker.Process(job, context)
	case enums.JobTypeMerge:
		context, cancel := context.WithCancel(context.Background())

		JobManagerInstance.JobMutex.Lock()
		JobManagerInstance.JobCancelMap[job.Identifier] = cancel
		JobManagerInstance.JobMutex.Unlock()

		err = MergeVideoWorker.Process(job, context)
	case enums.JobTypeGif:
		context, cancel := context.WithCancel(context.Background())

		JobManagerInstance.JobMutex.Lock()
		JobManagerInstance.JobCancelMap[job.Identifier] = cancel
		JobManagerInstance.JobMutex.Unlock()

		err = GifVideoWorker.Process(job, context)
	case enums.JobTypeExtractAudio:
		context, cancel := context.WithCancel(context.Background())

		JobManagerInstance.JobMutex.Lock()
		JobManagerInstance.JobCancelMap[job.Identifier] = cancel
		JobManagerInstance.JobMutex.Unlock()

		err = ExtractAudioWorker.Process(job, context)
	case enums.JobTypeTrimAudio:
		context, cancel := context.WithCancel(context.Background())

		JobManagerInstance.JobMutex.Lock()
		JobManagerInstance.JobCancelMap[job.Identifier] = cancel
		JobManagerInstance.JobMutex.Unlock()

		err = TrimAudioWorker.Process(job, context)
	case enums.JobTypeEditor:
		context, cancel := context.WithCancel(context.Background())

		JobManagerInstance.JobMutex.Lock()
		JobManagerInstance.JobCancelMap[job.Identifier] = cancel
		JobManagerInstance.JobMutex.Unlock()

		err = EditorVideoWorker.Process(job, context)
	}

	if err != nil {
		if errors.Is(err, context.Canceled) {
			currentJob, fetchErr := JobService.GetJobById(job.ID)
			if fetchErr == nil && currentJob.Status == enums.StatusDraft {
				return
			}
			JobService.UpdateJob(job.ID, entities.Job{
				Status:     enums.StatusCancelled,
				FinishedAt: time.Now(),
			})
			return
		}
		err = JobService.UpdateJob(job.ID, entities.Job{
			Status:     enums.StatusFailed,
			Error:      err.Error(),
			FinishedAt: time.Now(),
		})
		return
	}

	err = JobService.UpdateJob(job.ID, entities.Job{
		Status:     enums.StatusCompleted,
		FinishedAt: time.Now(),
	})
}
