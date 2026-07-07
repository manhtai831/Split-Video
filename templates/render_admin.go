package templates

import (
	"app/assets"
	"app/config"
	"encoding/json"
	"html/template"
	"net/http"
)

var adminLayoutFiles = []string{
	"templates/layouts/admin.html",
	"templates/partials/job_modals.html",
}

func RenderAdmin(w http.ResponseWriter, page string, data any) error {
	files := append(adminLayoutFiles, page)
	tmpl, err := template.New("admin").Funcs(template.FuncMap{
		"asset":  assets.URL,
		"absURL": config.AbsURL,
		"add": func(a, b int) int {
			return a + b
		},
		"json": func(v any) (template.JS, error) {
			b, err := json.Marshal(v)
			if err != nil {
				return "", err
			}
			return template.JS(b), nil
		},
	}).ParseFiles(files...)
	if err != nil {
		return err
	}
	return tmpl.ExecuteTemplate(w, "admin", data)
}
