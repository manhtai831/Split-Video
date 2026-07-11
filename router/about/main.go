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
		Title:         "Về Chúng Tôi — Bộ Công Cụ Xử Lý Video Online Miễn Phí",
		Description:   "Video Tools là bộ công cụ video online miễn phí: cắt chia video, ghép clip, tạo GIF, tách MP3, video editor. Free online video tools — tự host, file tự xóa sau 30 ngày.",
		DescriptionEN: "About Video Tools — free online video tools for split, merge, GIF, extract audio (MP3) and browser video editor. Self-hosted; files auto-deleted after 30 days.",
		ActivePage:    "about",
		UserID:        middleware.GetUserID(w, r),
	}
	data.Finalize()

	if err := templates.Render(w, "templates/pages/about.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
