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
		Title:         "FAQ — Câu Hỏi Thường Gặp về Công Cụ Video Online",
		Description:   "FAQ Video Tools: lưu trữ file, giữ 30 ngày, định dạng MP4/MKV/MOV, cách chia cắt video, ghép video, tạo GIF, tách audio MP3 và video editor online.",
		DescriptionEN: "Video Tools FAQ — file storage, 30-day retention, supported formats, how to split/cut video, merge, GIF, extract audio to MP3 and online video editor.",
		ActivePage:    "faq",
		FAQItems:      structs.DefaultFAQItems(),
		UserID:        middleware.GetUserID(w, r),
	}
	data.Finalize()

	if err := templates.Render(w, r, "templates/pages/faq.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
