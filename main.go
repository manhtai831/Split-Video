package main

import (
	"app/common/Global"
	"app/middleware"
	"app/router"
	"app/worker/FileRetentionWorker"
	"app/worker/channels"
	"net/http"
)

func main() {
	Global.Bootstrap()
	router.Bootstrap()
	channels.Initialize()
	FileRetentionWorker.Start()
	http.ListenAndServe(":3000", middleware.Apply(http.DefaultServeMux))
}
