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

	title := "Chỉnh Sửa Video Online — Video Editor Trên Trình Duyệt"
	description := "Chỉnh sửa video online miễn phí ngay trên trình duyệt. Online video editor: thêm layer video/ảnh/text, timeline, lưu draft và xuất bản — không cần cài phần mềm."
	descriptionEN := "Free online video editor in your browser — add video, image & text layers, edit timeline, save drafts and publish. No install required."

	if jobID != "" {
		job, err := JobService.GetJobByIdentifierForUser(jobID, userID)
		if err == nil && job.Type == enums.JobTypeEditor {
			name := editorProjectName(job.ID)
			title = fmt.Sprintf("Chỉnh sửa project %s", name)
			description = fmt.Sprintf("Tiếp tục chỉnh sửa project video %s — draft, layer, timeline và xuất bản.", name)
			descriptionEN = fmt.Sprintf("Continue editing video project %s — drafts, layers, timeline and publish.", name)
		}
	}

	data := structs.PageData{
		Title:         title,
		Description:   description,
		DescriptionEN: descriptionEN,
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
