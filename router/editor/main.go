package editor

import (
	"app/enums"
	"app/middleware"
	"app/services/JobFileDataService"
	"app/services/JobService"
	"app/structs"
	"app/templates"
	"fmt"
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

	userID := middleware.GetUserID(w, r)
	jobID := r.URL.Query().Get("job")

	title := "Video Editor Online — Chỉnh sửa video trên trình duyệt"
	description := "Tạo draft, thêm layer video/ảnh/text, chỉnh timeline và xuất bản. Quản lý project chỉnh sửa video online miễn phí."

	if jobID != "" {
		job, err := JobService.GetJobByIdentifierForUser(jobID, userID)
		if err == nil && job.Type == enums.JobTypeEditor {
			name := editorProjectName(job.ID)
			title = fmt.Sprintf("Chỉnh sửa project %s", name)
			description = fmt.Sprintf("Tiếp tục chỉnh sửa project video %s — draft, layer, timeline và xuất bản.", name)
		}
	}

	data := structs.PageData{
		Title:         title,
		Description:   description,
		DescriptionEN: "Manage video editor projects: create drafts, publish, and reopen to continue editing.",
		ActivePage:    "editor",
		UserID:        userID,
		Result:        jobID,
		Breadcrumbs:   structs.ToolBreadcrumbs("Video Editor", "/video/editor"),
	}
	data.Finalize()

	if err := templates.Render(w, "templates/pages/editor.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func editorProjectName(jobID int) string {
	files, err := JobFileDataService.GetJobFileDataByJobId(jobID, enums.JobFileDataTypeInput)
	if err != nil || len(files) == 0 {
		return "Editor project"
	}
	return files[0].Name
}
