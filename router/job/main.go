package job

import (
	"app/worker/channels"
	"net/http"
)

func Bootstrap() {
	http.HandleFunc("/job/cancel", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		jobIdentifier := r.URL.Query().Get("jobIdentifier")
		channels.JobManagerInstance.JobMutex.Lock()
		cancel, ok := channels.JobManagerInstance.JobCancelMap[jobIdentifier]
		if !ok {
			http.Error(w, "Job not found", http.StatusNotFound)
			return
		}
		cancel()
		channels.JobManagerInstance.JobMutex.Unlock()
	})
}
