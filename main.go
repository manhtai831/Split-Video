package main

import (
	"app/common/Global"
	"app/middleware"
	"app/router"
	"app/services/StorageService"
	"app/worker/FileRetentionWorker"
	"app/worker/YtDlpUpdaterWorker"
	"app/worker/channels"
	"net/http"
)

func main() {
	Global.Bootstrap()
	router.Bootstrap()
	channels.Initialize()
	FileRetentionWorker.Start()
	YtDlpUpdaterWorker.Start()
	StorageService.Start()
	http.ListenAndServe(":3000", middleware.Apply(http.DefaultServeMux))
}
