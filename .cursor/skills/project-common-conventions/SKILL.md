---
name: project-common-conventions
description: Full-stack conventions for adding or editing video features in this repo (templates, JS modules, Go router/DTO/service/worker, localStorage, jobs panel). Use when implementing a new feature, copying Split patterns, or changing pages under templates/pages, router/, structs/, services/, or worker/.
---

# Project Common Conventions

Split is the reference feature. Follow these conventions for new/edited features. Do **not** copy known Split quirks listed in Exceptions.

For copy-paste skeletons, see [skeletons.md](skeletons.md).

## Architecture

**Submit flow (PRG):** POST multipart → upload `uploads/` → `Parse*Form` → `*Service.CreateJob` → `channels.JobChannel <- job` → `303 See Other` → GET same URL.

```
Browser: pages/{feature}.html → {feature}-estimate.js + file-preview.js + jobs-panel.js → JobUI + localStorage
Server:  router/{feature} → Parse{Feature}Form → {Feature}Service → JobChannel → {Feature}Worker
         jobs-panel.js ← API router/api/jobs
```

## File layout

### Frontend

| Role | Path |
|------|------|
| Page | `templates/pages/{feature}.html` — `{{define "content"}}` only |
| Layout | `templates/layouts/root.html` via `templates.Render()` |
| Partials | Always include `jobModals`; sidebar in layout |
| CSS | Prefer `jobs-ui.css` / `root.css` / `layout.css` — **no** per-feature CSS except home (`home.css`) |
| Shared JS | `public/static/js/job-ui.js` → `window.JobUI` |
| Estimate | `public/static/js/{feature}-estimate.js` |
| File preview | `public/static/js/{feature}-file-preview.js` |
| Jobs panel | `public/static/js/{feature}-jobs-panel.js` |

**Script order in template:** `job-ui.js` → jobs-panel → estimate → file-preview → inline `DOMContentLoaded` calling `init{Feature}*()`.

### Backend

| Role | Path |
|------|------|
| Router | `router/{feature}/main.go` — `Bootstrap()` |
| DTO | `structs/{Feature}JobExtrasDto.go` — `Parse{Feature}Form`, `ToJSON` |
| Options | `structs/{Feature}OptionsDto.go` if needed |
| Service | `services/{Feature}Service/main.go` |
| Worker | `worker/{Feature}Worker/main.go` |
| Enum | `enums/JobType.go` |
| Dispatch | `worker/channels/main.go` |
| Bootstrap | `router/main.go` → `{feature}.Bootstrap()` |
| Nav | `templates/partials/sidebar.html` |

## Naming

| Item | Convention | Example |
|------|------------|---------|
| Route | `/video/{kebab-feature}` | `/video/split` |
| ActivePage | kebab-case | `"split"` |
| Job type enum | snake_case | `"extract_audio"` |
| Form id | `{feature}Form` | `splitForm` |
| File input | `id="file"`, `name="file"` (merge: `name="files"`) | |
| Field names/ids | `snake_case` | `split_mode` |
| Jobs IDs | `{feature}Jobs*` | `splitJobsTableBody` |
| Estimate box | `estimateBox` / `estimateTime` | GIF exception: `gifEstimateBox` |
| JS file | `{feature}-{concern}.js` | `split-estimate.js` |
| Init | `window.init{Feature}{Concern}` | `initSplitEstimate` |
| JS style | IIFE + `"use strict"` on **new** files | No ES modules |
| Go package dir | lowercase, no separator | `extractaudio` |
| DTO / Parse | `{Feature}JobExtrasDto` / `Parse{Feature}Form` | |
| Service / Worker | `{Feature}Service` / `{Feature}Worker` | |

**CSS:** BEM-like — `.form-field`, `.file-preview-item__thumb`, `.btn--primary`, utilities `.input-row`, `.gap-col-16`.

## UI rules

- Vietnamese copy + English subtitle (`page-header__subtitle`)
- No inline `style=` (except temporary `height: 32px` spacer form↔history)
- No legacy `#resultBox` JS
- `.field-hint` required for complex options; use `<strong>` for keywords
- No new CSS file unless home-like dashboard
- Conditional panels: `hidden` + disable inputs when hidden
- Advanced options: `<details class="advanced-options">`
- Mobile: table hidden, `.history-card-list` shown (jobs-ui.css)

**Required jobs IDs:** `{feature}JobsEmpty`, `JobsTableWrap`, `JobsTableBody`, `JobsCardList`, `JobsSkeleton`, `JobsPagination`, `JobsRange`, `JobsPageInfo`, `JobsPagePrev`, `JobsPageNext`.

## Router POST (required pattern)

Prefer merge/gif/extract-audio style — **not** Split’s silent empty-upload return:

- Split GET/POST in handler; POST delegates then `return`
- `r.MultipartReader()` streaming — **not** `ParseMultipartForm`
- Upload path: `uploads/{md5(filename)}{nanotimestamp}{ext}`
- Empty upload → `400` clear Vietnamese message
- Invalid form → `http.Error 400`
- Success → `303` to `/video/{feature}`
- Legacy URL → `301` when applicable

## localStorage

| Persist | Do not persist |
|---------|----------------|
| Select/number/radio/text options | `FileList` |
| Mode toggles | Estimate `fileStats` |
| Advanced encode settings | Jobs page number |

- Key: `{feature}Form.options` (e.g. `splitForm.options`)
- Init: `applySavedFormState()` **before** panel visibility
- After POST redirect: options restore; files gone (expected)

## File input & bfcache

- Mutate files only via `DataTransfer` + `setInputFiles`
- End of file-preview `init`: `syncFromFileInput()`
- `pageshow` with `e.persisted` → `syncFromFileInput()`
- `beforeunload` → revoke object URLs
- preview + estimate both listen `#file` `change` — no global callbacks unless complex (GIF timeline)
- Probe duration with `<video preload="metadata">` + object URL

## Jobs panel

- `PAGE_SIZE = 5`, poll `5000` ms
- `JobUI.fetchJobs({ type: "{job_type_enum}", ... })` — enum must match (`extract_audio`, not kebab)
- Use `JobUI.badgeHtml`, `actionButtonsHtml`, `bindRowActions`, `updatePagination`

## Backend patterns

**DTO:** `{Feature}JobExtrasDto` + `allowed*` maps + `Parse{Feature}Form` + `ToJSON` + `structs/{Feature}JobExtrasDto_test.go`. Reuse `FfmpegEncodeOptionsDto` for video encode.

**CreateJob:** UUID identifier, `StatusPending`, set `Type`/`Extras`/`UserID`, DB create, input `JobFileData`.

**Worker Process:** skip terminal → load input files → parse extras → process with `context.Context` → write outputs → status completed/failed.

**Register new feature:** `JobType` enum → channels switch → JobPresenter encode summary if needed → `job-ui.js` `TYPE_LABELS` → sidebar link → `router/main.go` Bootstrap.

## Checklist: new `{feature}`

### Frontend
- [ ] `templates/pages/{feature}.html` — form + jobs + modals + scripts
- [ ] `{feature}-estimate.js` — localStorage + estimate
- [ ] `{feature}-file-preview.js` — DataTransfer + pageshow (if upload)
- [ ] `{feature}-jobs-panel.js` — JobUI
- [ ] Styles only in `jobs-ui.css` if new components needed
- [ ] `ActivePage` matches sidebar

### Backend
- [ ] `router/{feature}/main.go` — GET/POST + legacy redirect if needed
- [ ] `structs/{Feature}JobExtrasDto.go` + tests
- [ ] `services/{Feature}Service/main.go`
- [ ] `worker/{Feature}Worker/main.go`
- [ ] `enums/JobType.go` + `worker/channels/main.go`
- [ ] `router/main.go` Bootstrap
- [ ] `sidebar.html` nav item
- [ ] `TYPE_LABELS` in `job-ui.js`

### Verify
- [ ] Refresh → form options restore
- [ ] Back/forward → preview + estimate sync (`pageshow`)
- [ ] Submit → 303, jobs panel shows new job
- [ ] Empty upload → 400 clear message
- [ ] Mobile → card list visible

## Exceptions (do not copy blindly)

| Feature | Differs from standard | Agent note |
|---------|----------------------|------------|
| Merge | `name="files"`, drag-sort, `handleMergeSubmit()` | Multi-file single job |
| GIF | `gifEstimateBox`, timeline/segments, no video modal | Domain UI |
| Extract-audio | Audio options instead of video encode | Otherwise like Split |
| Home | `home-dashboard.js`, cross-type jobs, `home.css` | Dashboard, no upload form |
| Split router | Silent empty upload; no legacy redirect | **New features must not do this** |
| Split estimate | Missing `"use strict"`; dead `resultBox` JS | Do not copy |
