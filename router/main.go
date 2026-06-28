package router

import (
	staticfiles "app/router/static"
	"app/router/split"
	"app/structs"
	"app/templates"
	"net/http"

	"gorm.io/gorm"
)

var DB *gorm.DB

func Bootstrap() {
	staticfiles.Bootstrap()
	split.Bootstrap()

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		data := structs.PageData{
			Title:      "Home",
			ActivePage: "home",
		}
		if err := templates.Render(w, "templates/pages/home.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})
}
