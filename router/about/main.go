package about

import (
	"app/middleware"
	"app/structs"
	"app/templates"
	"net/http"
)

func Bootstrap() {
	http.HandleFunc("/about", handleAbout)
}

func handleAbout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data := structs.PageData{
		Title:         "Về Video Tools — Công cụ xử lý video online miễn phí",
		Description:   "Video Tools — bộ công cụ chia, ghép, tạo GIF, tách audio và chỉnh sửa video online miễn phí. Xử lý trên server tự host, file tự xóa sau 30 ngày.",
		DescriptionEN: "Video Tools — free online video split, merge, GIF, audio extract and editor. Self-hosted processing; files auto-deleted after 30 days.",
		ActivePage:    "about",
		UserID:        middleware.GetUserID(w, r),
	}
	data.Finalize()

	if err := templates.Render(w, "templates/pages/about.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
