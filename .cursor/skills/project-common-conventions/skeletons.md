# Skeletons — Project Common Conventions

Copy-paste templates for a new `{feature}`. Replace placeholders; keep naming from SKILL.md.

## HTML page shell

```html
{{define "content"}}
<link href="{{asset "css/jobs-ui.css"}}" rel="stylesheet" />
<div class="container">
  <div class="page-header">
    <h2>Tiêu đề VN <span class="page-header__subtitle" lang="en">/ English</span></h2>
    <p class="page-description--en">{{.Description}}</p>
  </div>
  <form id="{feature}Form" action="/video/{feature}" method="post" enctype="multipart/form-data"
    onsubmit="this.querySelector('button[type=submit]').disabled=true; this.querySelector('button[type=submit]').innerText='Processing...'">
    <!-- fields -->
  </form>
  <div style="height: 32px"></div>
  <section class="home-section">
    <!-- jobs history: {feature}Jobs* IDs -->
  </section>
</div>
{{template "jobModals" .}}
<!-- optional videoPreviewModal -->
<script src="{{asset "js/job-ui.js"}}"></script>
<script src="{{asset "js/{feature}-jobs-panel.js"}}"></script>
<script src="{{asset "js/{feature}-estimate.js"}}"></script>
<script src="{{asset "js/{feature}-file-preview.js"}}"></script>
<script>
  document.addEventListener("DOMContentLoaded", function () {
    init{Feature}JobsPanel();
    init{Feature}Estimate();
    init{Feature}FilePreview();
  });
</script>
{{end}}
```

### Form field

```html
<div class="form-field">
  <label for="size">Độ phân giải đầu ra</label>
  <select id="size" name="size">...</select>
  <p class="field-hint">Giải thích ngắn. <strong>Keyword</strong> nổi bật.</p>
</div>
```

### Multi-file preview block

```html
<input id="file" type="file" name="file" accept="video/*" required multiple />
<input id="fileAddMore" type="file" accept="video/*" multiple hidden aria-hidden="true" tabindex="-1" />
<div id="filePreviewSection" class="file-preview-section" hidden>
  <div class="file-preview-section__header">...</div>
  <div id="filePreviewList" class="file-preview-list" role="list"></div>
</div>
```

### Video preview modal

```html
<dialog id="videoPreviewModal" class="video-preview-modal">
  <h3 id="videoPreviewTitle"></h3>
  <p id="videoPreviewMeta"></p>
  <video id="videoPreviewPlayer" controls playsinline></video>
</dialog>
```

## Estimate JS (localStorage)

```javascript
(function () {
  "use strict";

  const FORM_STORAGE_KEY = "{feature}Form.options";
  const PERSISTED_FIELD_IDS = ["size", "output_format", "crf"];

  function collectFormState() {
    const state = {};
    PERSISTED_FIELD_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) state[id] = el.value;
    });
    return state;
  }

  function applySavedFormState() {
    const saved = readFormStateFromStorage();
    if (!saved) return;
    // restore radio + fields, THEN panel visibility
  }

  function persistFormState() {
    writeFormStateToStorage(collectFormState());
  }

  window.init{Feature}Estimate = function () {
    applySavedFormState();
    // bind change/input → persistFormState
    // listen #file change → probe metadata / estimate
  };
})();
```

## File preview JS (DataTransfer + pageshow)

```javascript
(function () {
  "use strict";

  function setInputFiles(input, files) {
    const dt = new DataTransfer();
    for (let i = 0; i < files.length; i++) dt.items.add(files[i]);
    input.files = dt.files;
    if (files.length === 0) input.value = "";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncFromFileInput() {
    const fileInput = document.getElementById("file");
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  window.init{Feature}FilePreview = function () {
    // bind add/remove/reorder via setInputFiles
    syncFromFileInput();
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) syncFromFileInput();
    });
    window.addEventListener("beforeunload", revokeAllUrls);
  };
})();
```

## Jobs panel JS

```javascript
(function () {
  "use strict";

  const PAGE_SIZE = 5;
  const POLL_INTERVAL_MS = 5000;
  const state = { page: 1 };

  function loadJobs() {
    JobUI.fetchJobs({ type: "{job_type_enum}", limit: PAGE_SIZE, page: state.page }).then(
      /* render table + cards + pagination + skeleton */
    );
  }

  window.init{Feature}JobsPanel = function () {
    JobUI.init({
      modals: { /* errorModal, downloadModal, ... */ },
      onCancelSuccess: loadJobs,
      onRetrySuccess: loadJobs,
    });
    bindEvents();
    loadJobs();
    startPolling();
  };
})();
```

## Go router

```go
func handleFeature(w http.ResponseWriter, r *http.Request) {
    userID := middleware.GetUserID(w, r)
    data := structs.PageData{ActivePage: "{feature}"}

    if r.Method == "POST" {
        handleFeaturePost(w, r, userID)
        return
    }
    templates.Render(w, "templates/pages/{feature}.html", data)
}

// handleFeaturePost:
// - MultipartReader streaming
// - upload to uploads/{md5}{nano}{ext}
// - empty → 400 Vietnamese message
// - Parse{Feature}Form → 400 if invalid
// - Service.CreateJob → JobChannel
// - 303 to /video/{feature}
```

## Go CreateJob

```go
func CreateJob(videoPath, name, extras, userID string) (entities.Job, error) {
    job := entities.Job{
        Identifier: uuid.New().String(),
        Status:     enums.StatusPending,
        Type:       enums.JobType{Feature},
        Extras:     extras,
        UserID:     userID,
    }
    // Global.DB.Create(&job) + JobFileData input
    return job, nil
}
```

## Worker Process outline

1. Skip if job already terminal
2. Load input `JobFileData`
3. Parse extras JSON → DTO
4. Process with `context.Context` (cancel-aware)
5. Write output `JobFileData`
6. Update status completed/failed
