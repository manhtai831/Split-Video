package templates

import (
	"app/assets"
	"html/template"
	"net/http"
)

var layoutFiles = []string{
	"templates/layouts/root.html",
	"templates/partials/navbar.html",
	"templates/partials/sidebar.html",
	"templates/partials/rightbar.html",
	"templates/partials/job_modals.html",
}

func Render(w http.ResponseWriter, page string, data any) error {
	files := append(layoutFiles, page)
	tmpl, err := template.New("root").Funcs(template.FuncMap{
		"asset": assets.URL,
	}).ParseFiles(files...)
	if err != nil {
		return err
	}
	return tmpl.ExecuteTemplate(w, "root", data)
}
