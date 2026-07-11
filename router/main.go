package router

import (
	apijobs "app/router/api/jobs"
	apieditor "app/router/api/editor"
	apiupload "app/router/api/upload"
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
	"app/router/youtubedownload"
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
	apiupload.Bootstrap()
	job.Bootstrap()
	split.Bootstrap()
	merge.Bootstrap()
	gif.Bootstrap()
	extractaudio.Bootstrap()
	editor.Bootstrap()
	youtubedownload.Bootstrap()
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
		Title:         "Công Cụ Video Online Miễn Phí — Cắt, Ghép, GIF, MP3",
		Description:   "Video tools online miễn phí: chia cắt video, ghép clip, tạo GIF, tách audio MP3, chỉnh sửa video. Không cài app — hỗ trợ MP4, MKV, MOV. Free online video splitter, merger & editor.",
		DescriptionEN: "Free online video tools — split & cut video, merge clips, video to GIF, extract audio to MP3, browser video editor. No install. MP4, MKV, MOV supported.",
		ActivePage:    "home",
		UserID:        middleware.GetUserID(w, r),
	}
	data.Finalize()

	if err := templates.Render(w, "templates/pages/home.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
