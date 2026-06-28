package staticfiles

import "net/http"

func Bootstrap() {
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("public/static"))))
}
