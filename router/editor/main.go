package editor

import (
	"app/middleware"
	"app/structs"
	"app/templates"
	"net/http"
)

func Bootstrap() {
	http.HandleFunc("/video/editor", handleEditor)
}

func handleEditor(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data := structs.PageData{
		Title:         "Video Editor — Mock UI",
		Description:   "Chỉnh sửa video trên trình duyệt: thêm text, logo, caption theo timeline. Xuất cấu hình JSON (mock — chưa xử lý video thật).",
		DescriptionEN: "Browser-based video editor mock: add text, logo, caption layers with timeline. Export JSON config (mock — no real video processing).",
		ActivePage:    "editor",
		UserID:        middleware.GetUserID(w, r),
	}

	if err := templates.Render(w, "templates/pages/editor.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
