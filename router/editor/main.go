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
		Title:         "Video Editor",
		Description:   "Quản lý project chỉnh sửa video: tạo draft, xuất bản, mở lại để chỉnh sửa tiếp.",
		DescriptionEN: "Manage video editor projects: create drafts, publish, and reopen to continue editing.",
		ActivePage:    "editor",
		UserID:        middleware.GetUserID(w, r),
		Result:        r.URL.Query().Get("job"),
	}

	if err := templates.Render(w, "templates/pages/editor.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
