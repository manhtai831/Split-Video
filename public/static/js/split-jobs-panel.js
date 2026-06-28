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

  function initSplitJobsPanel() {
    cacheElements();
    JobUI.init({
      modals: {
        errorModal: $("errorModal"),
        errorModalMessage: $("errorModalMessage"),
        errorModalClose: $("errorModalClose"),
        downloadModal: $("downloadModal"),
        downloadModalJobName: $("downloadModalJobName"),
        downloadSelectAll: $("downloadSelectAll"),
        downloadFileList: $("downloadFileList"),
        downloadModalCancel: $("downloadModalCancel"),
        downloadModalConfirm: $("downloadModalConfirm"),
      },
      onCancelSuccess: loadJobs,
    });
    bindEvents();
    loadJobs();
    startPolling();
  }

  function cacheElements() {
    els.tableBody = $("splitJobsTableBody");
    els.cardList = $("splitJobsCardList");
    els.empty = $("splitJobsEmpty");
    els.tableWrap = $("splitJobsTableWrap");
    els.skeleton = $("splitJobsSkeleton");
    els.pagination = $("splitJobsPagination");
    els.range = $("splitJobsRange");
    els.pageInfo = $("splitJobsPageInfo");
    els.pagePrev = $("splitJobsPagePrev");
    els.pageNext = $("splitJobsPageNext");
  }

  function bindEvents() {
    els.pagePrev.addEventListener("click", function () {
      if (state.page > 1) {
        state.page--;
        loadJobs();
      }
    });

    els.pageNext.addEventListener("click", function () {
      state.page++;
      loadJobs();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    });
  }

  function loadJobs() {
    els.skeleton.hidden = false;
    els.tableWrap.hidden = true;
    els.empty.hidden = true;
    els.pagination.hidden = true;

    JobUI.fetchJobs({ type: "split", limit: PAGE_SIZE, page: state.page })
      .then(function (data) {
        els.skeleton.hidden = true;
        renderSplitJobs(data);
      })
      .catch(function () {
        els.skeleton.hidden = true;
        els.empty.hidden = false;
        els.empty.querySelector("p").textContent = "Không thể tải danh sách job.";
      });
  }

  function renderSplitJobs(data) {
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

  function buildTableRow(job) {
    var tr = document.createElement("tr");
    var pct =
      job.status === "completed" || job.status === "failed" || job.status === "cancelled"
        ? "—"
        : Math.round((job.progress || 0) * 100) + "%";

    tr.innerHTML =
      '<td class="cell-filename" title="' + JobUI.escapeHtml(job.file_name) + '">' +
        JobUI.escapeHtml(JobUI.truncateFileName(job.file_name)) +
      "</td>" +
      "<td>" + JobUI.badgeHtml(job.status, "status") + "</td>" +
      "<td>" + pct + "</td>" +
      "<td>" + JobUI.dateTimeCellHtml(job.created_at) + "</td>" +
      "<td>" + JobUI.dateTimeCellHtml(job.finished_at) + "</td>" +
      '<td class="cell-actions"><div class="cell-actions__inner">' +
        JobUI.actionButtonsHtml(job) +
      "</div></td>";

    JobUI.bindRowActions(tr, job);
    return tr;
  }

  function buildCard(job) {
    var card = document.createElement("div");
    card.className = "history-card";

    var pct =
      job.status === "completed" || job.status === "failed" || job.status === "cancelled"
        ? "—"
        : Math.round((job.progress || 0) * 100) + "%";

    card.innerHTML =
      '<div class="history-card__filename" title="' + JobUI.escapeHtml(job.file_name) + '">' +
        JobUI.escapeHtml(JobUI.truncateFileName(job.file_name, CARD_FILENAME_MAX_LEN)) +
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
        '<span class="cell-actions__inner">' + JobUI.actionButtonsHtml(job) + "</span>" +
      "</div>";

    JobUI.bindRowActions(card, job);
    return card;
  }

  function refreshJobs() {
    JobUI.fetchJobs({ type: "split", limit: PAGE_SIZE, page: state.page })
      .then(function (data) {
        renderSplitJobs(data);
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

  window.initSplitJobsPanel = initSplitJobsPanel;
})();
