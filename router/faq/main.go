package faq

import (
	"app/middleware"
	"app/structs"
	"app/templates"
	"net/http"
)

func Bootstrap() {
	http.HandleFunc("/faq", handleFAQ)
}

func handleFAQ(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data := structs.PageData{
		Title:         "Câu hỏi thường gặp — Video Tools",
		Description:   "FAQ về Video Tools: lưu trữ file trên server, thời gian giữ 30 ngày, định dạng hỗ trợ, chia ghép video, GIF, tách audio và editor.",
		DescriptionEN: "Video Tools FAQ — file storage, 30-day retention, supported formats, split, merge, GIF, audio and editor.",
		ActivePage:    "faq",
		FAQItems:      structs.DefaultFAQItems(),
		UserID:        middleware.GetUserID(w, r),
	}
	data.Finalize()

	if err := templates.Render(w, "templates/pages/faq.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
