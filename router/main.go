package router

import (
	apijobs "app/router/api/jobs"
	apieditor "app/router/api/editor"
	"app/router/about"
	"app/router/admin"
	"app/router/editor"
	"app/router/extractaudio"
	"app/router/faq"
	"app/router/job"
	"app/router/gif"
	"app/router/merge"
	routerseo "app/router/seo"
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
	routerseo.Bootstrap()
	apijobs.Bootstrap()
	apieditor.Bootstrap()
	job.Bootstrap()
	split.Bootstrap()
	merge.Bootstrap()
	gif.Bootstrap()
	extractaudio.Bootstrap()
	editor.Bootstrap()
	about.Bootstrap()
	faq.Bootstrap()
	admin.Bootstrap()

	http.HandleFunc("/", handleHome)
}

func handleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	data := structs.PageData{
		Title:         "Chia & Cắt Video Online Miễn Phí",
		Description:   "Công cụ chia, cắt và nén video online miễn phí — không cần cài đặt. Hỗ trợ MP4, MKV, MOV. Theo dõi job real-time, tải ZIP ngay.",
		DescriptionEN: "Free online video splitter & cutter — no install required. Supports MP4, MKV, MOV. Track jobs in real time and download ZIP when done.",
		ActivePage:    "home",
		UserID:        middleware.GetUserID(w, r),
	}
	data.Finalize()

	if err := templates.Render(w, "templates/pages/home.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
