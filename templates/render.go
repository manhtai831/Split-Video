package templates

import (
	"app/assets"
	"app/config"
	"app/middleware"
	"app/structs"
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
	"templates/partials/chunk_upload.html",
	"templates/partials/password_toggle.html",
}

func applyAuth(r *http.Request, data any) any {
	if r == nil {
		return data
	}
	user := middleware.UserFromContext(r.Context())
	switch d := data.(type) {
	case structs.PageData:
		if user != nil {
			d.IsLoggedIn = true
			d.UserEmail = user.Email
		}
		return d
	case *structs.PageData:
		if user != nil {
			d.IsLoggedIn = true
			d.UserEmail = user.Email
		}
		return d
	default:
		return data
	}
}

func Render(w http.ResponseWriter, r *http.Request, page string, data any) error {
	data = applyAuth(r, data)
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
