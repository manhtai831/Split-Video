package channels

import (
	"app/entities"
	"app/enums"
	"app/services/JobService"
	"app/worker/SplitVideoWorker"
	"fmt"
)

var JobChannel chan entities.Job

func Initialize() {
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
		SplitVideoWorker.Process(job)
	}

}
