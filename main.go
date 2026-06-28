package main

import (
	"app/common/Global"
	"app/router"
	"app/worker/channels"
	"net/http"
)

func main() {
	Global.Bootstrap()
	router.Bootstrap()
	channels.Initialize()
	http.ListenAndServe(":3000", nil)
}
