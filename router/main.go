package router

import (
	apijobs "app/router/api/jobs"
	"app/router/job"
	staticfiles "app/router/static"
	"app/router/split"
	"app/middleware"
	"app/structs"
	"app/templates"
	"net/http"

	"gorm.io/gorm"
)

var DB *gorm.DB

func Bootstrap() {
	staticfiles.Bootstrap()
	apijobs.Bootstrap()
	job.Bootstrap()
	split.Bootstrap()

	http.HandleFunc("/", middleware.WithUserID(func(w http.ResponseWriter, r *http.Request) {
		data := structs.PageData{
			Title:         "Chia & Cắt Video Online Miễn Phí",
			Description:   "Công cụ chia, cắt và nén video online miễn phí — không cần cài đặt. Hỗ trợ MP4, MKV, MOV. Theo dõi tiến độ job real-time, tải ZIP ngay khi xong.",
			DescriptionEN: "Free online video splitter & cutter — no install required. Supports MP4, MKV, MOV. Track jobs in real time and download ZIP when done.",
			ActivePage:    "home",
			UserID:        middleware.GetUserID(w, r),
		}
		if err := templates.Render(w, "templates/pages/home.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
}
