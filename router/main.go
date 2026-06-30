package router

import (
	apijobs "app/router/api/jobs"
	"app/router/job"
	staticfiles "app/router/static"
	"app/router/split"
	"app/middleware"
	"app/structs"
	"app/templates"
	"net/http"

	"gorm.io/gorm"
)

var DB *gorm.DB

func Bootstrap() {
	staticfiles.Bootstrap()
	apijobs.Bootstrap()
	job.Bootstrap()
	split.Bootstrap()

	http.HandleFunc("/", middleware.WithUserID(func(w http.ResponseWriter, r *http.Request) {
		data := structs.PageData{
			Title:      "Home",
			ActivePage: "home",
			UserID:     middleware.GetUserID(w, r),
		}
		if err := templates.Render(w, "templates/pages/home.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
}
