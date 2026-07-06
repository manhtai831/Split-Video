package templates

import (
	"app/assets"
	"app/config"
	"encoding/json"
	"html/template"
	"net/http"
)

var layoutFiles = []string{
	"templates/layouts/root.html",
	"templates/partials/navbar.html",
	"templates/partials/sidebar.html",
	"templates/partials/rightbar.html",
	"templates/partials/footer.html",
	"templates/partials/seo-jsonld.html",
	"templates/partials/seo-tool-content.html",
	"templates/partials/job_modals.html",
}

func Render(w http.ResponseWriter, page string, data any) error {
	files := append(layoutFiles, page)
	tmpl, err := template.New("root").Funcs(template.FuncMap{
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
	return tmpl.ExecuteTemplate(w, "root", data)
}
