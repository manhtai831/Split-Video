(function () {
  "use strict";

  var PAGE_SIZE = 5;
  var POLL_INTERVAL_MS = 5000;
  var CARD_FILENAME_MAX_LEN = 150;

  var state = { page: 1 };
  var pollTimer = null;
  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function initEditorJobsPanel() {
    cacheElements();
    if (!els.tableBody) return;

    JobUI.init({
      modals: {
        errorModal: $("errorModal"),
        errorModalMessage: $("errorModalMessage"),
        errorModalClose: $("errorModalClose"),
        errorModalRetry: $("errorModalRetry"),
        downloadModal: $("downloadModal"),
        downloadModalJobName: $("downloadModalJobName"),
        downloadSelectAll: $("downloadSelectAll"),
        downloadFileList: $("downloadFileList"),
        downloadModalCancel: $("downloadModalCancel"),
        downloadModalConfirm: $("downloadModalConfirm"),
      },
      onCancelSuccess: loadJobs,
      onRetrySuccess: loadJobs,
    });
    bindEvents();
    loadJobs();
    startPolling();
  }

  function cacheElements() {
    els.tableBody = $("editorJobsTableBody");
    els.cardList = $("editorJobsCardList");
    els.empty = $("editorJobsEmpty");
    els.tableWrap = $("editorJobsTableWrap");
    els.skeleton = $("editorJobsSkeleton");
    els.pagination = $("editorJobsPagination");
    els.range = $("editorJobsRange");
    els.pageInfo = $("editorJobsPageInfo");
    els.pagePrev = $("editorJobsPagePrev");
    els.pageNext = $("editorJobsPageNext");
  }

  function bindEvents() {
    if (els.pagePrev) {
      els.pagePrev.addEventListener("click", function () {
        if (state.page > 1) {
          state.page--;
          loadJobs();
        }
      });
    }

    if (els.pageNext) {
      els.pageNext.addEventListener("click", function () {
        state.page++;
        loadJobs();
      });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    });
  }

  var ICON_EDIT =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 20h9"/>' +
    '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>' +
    "</svg>";

  function openEditorJob(identifier) {
    if (!identifier || !window.EditorShell) return;
    window.EditorShell.open(identifier);
  }

  function editButtonHtml() {
    return (
      '<button type="button" class="btn btn--ghost btn--icon btn-edit-editor" title="Chỉnh sửa" aria-label="Chỉnh sửa">' +
      ICON_EDIT +
      "</button>"
    );
  }

  function actionButtonsHtml(job) {
    return editButtonHtml() + JobUI.actionButtonsHtml(job);
  }

  function bindEditAction(container, job) {
    var editBtn = container.querySelector(".btn-edit-editor");
    if (!editBtn) return;
    editBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openEditorJob(job.identifier);
    });
  }

  function loadJobs() {
    els.skeleton.hidden = false;
    els.tableWrap.hidden = true;
    els.empty.hidden = true;
    els.pagination.hidden = true;

    JobUI.fetchJobs({ type: "editor", limit: PAGE_SIZE, page: state.page })
      .then(function (data) {
        els.skeleton.hidden = true;
        renderEditorJobs(data);
      })
      .catch(function () {
        els.skeleton.hidden = true;
        els.empty.hidden = false;
        els.empty.querySelector("p").textContent = "Không thể tải danh sách job.";
      });
  }

  function renderEditorJobs(data) {
    var items = data.items || [];

    els.tableBody.innerHTML = "";
    els.cardList.innerHTML = "";

    if (items.length === 0) {
      els.empty.hidden = false;
      els.tableWrap.hidden = true;
      els.pagination.hidden = true;
      return;
    }

    els.empty.hidden = true;
    els.tableWrap.hidden = false;

    items.forEach(function (job) {
      els.tableBody.appendChild(buildTableRow(job));
      els.cardList.appendChild(buildCard(job));
    });

    JobUI.updatePagination(
      {
        pagination: els.pagination,
        range: els.range,
        pageInfo: els.pageInfo,
        pagePrev: els.pagePrev,
        pageNext: els.pageNext,
      },
      data,
      function (page) {
        state.page = page;
      }
    );
  }

  function projectLabel(job) {
    if (job.encode_summary) return job.encode_summary;
    if (job.file_name) return job.file_name;
    return "Editor project";
  }

  function buildTableRow(job) {
    var tr = document.createElement("tr");
    tr.dataset.identifier = job.identifier;
    var label = projectLabel(job);
    var pct =
      job.status === "completed" || job.status === "failed" || job.status === "cancelled"
        ? "—"
        : Math.round((job.progress || 0) * 100) + "%";

    tr.innerHTML =
      '<td class="cell-filename" title="' + JobUI.escapeHtml(label) + '">' +
        JobUI.escapeHtml(JobUI.truncateFileName(label)) +
      "</td>" +
      "<td>" + JobUI.badgeHtml(job.status, "status") + "</td>" +
      "<td>" + pct + "</td>" +
      "<td>" + JobUI.dateTimeCellHtml(job.created_at) + "</td>" +
      "<td>" + JobUI.dateTimeCellHtml(job.finished_at) + "</td>" +
      '<td class="cell-actions"><div class="cell-actions__inner">' +
        actionButtonsHtml(job) +
      "</div></td>";

    JobUI.bindRowActions(tr, job);
    bindEditAction(tr, job);
    return tr;
  }

  function buildCard(job) {
    var card = document.createElement("div");
    card.className = "history-card";
    card.dataset.identifier = job.identifier;
    var label = projectLabel(job);
    var pct =
      job.status === "completed" || job.status === "failed" || job.status === "cancelled"
        ? "—"
        : Math.round((job.progress || 0) * 100) + "%";

    card.innerHTML =
      '<div class="history-card__filename" title="' + JobUI.escapeHtml(label) + '">' +
        JobUI.escapeHtml(JobUI.truncateFileName(label, CARD_FILENAME_MAX_LEN)) +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Trạng thái</span>' +
        JobUI.badgeHtml(job.status, "status") +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Tiến độ</span>' +
        "<span>" + pct + "</span>" +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Tạo lúc</span>' +
        "<span>" + JobUI.formatDateTime(job.created_at) + "</span>" +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Thao tác</span>' +
        '<span class="cell-actions__inner">' + actionButtonsHtml(job) + "</span>" +
      "</div>";

    JobUI.bindRowActions(card, job);
    bindEditAction(card, job);
    return card;
  }

  function refreshJobs() {
    JobUI.fetchJobs({ type: "editor", limit: PAGE_SIZE, page: state.page })
      .then(function (data) {
        renderEditorJobs(data);
      })
      .catch(function () {
        /* silent on poll failure */
      });
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      refreshJobs();
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  window.initEditorJobsPanel = initEditorJobsPanel;
  window.editorJobsPanelRefresh = refreshJobs;
})();
