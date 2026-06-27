package channels

import (
	"app/entities"
	"app/enums"
	"app/services/JobService"
	"app/worker/SplitVideoWorker"
	"context"
	"fmt"
	"sync"
)

type JobManager struct {
	JobCancelMap map[string]context.CancelFunc
	JobMutex     sync.Mutex
}

var JobChannel chan entities.Job
var JobManagerInstance JobManager

func Initialize() {
	JobManagerInstance = JobManager{}
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

	JobService.UpdateJob(job.ID, entities.Job{
		Status: enums.StatusProcessing,
	})

	job, err := JobService.GetJobById(job.ID)
	if err != nil {
		fmt.Printf("Error getting job: %v\n", err)
		return
	}

	if job.Type == enums.JobTypeSplit {
		context, cancel := context.WithCancel(context.Background())

		JobManagerInstance.JobMutex.Lock()
		JobManagerInstance.JobCancelMap[job.Identifier] = cancel
		JobManagerInstance.JobMutex.Unlock()

		SplitVideoWorker.Process(job, context)
	}

}
