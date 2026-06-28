(function () {
  "use strict";

  var PAGE_SIZE = 5;
  var POLL_INTERVAL_MS = 3000;
  var USE_MOCK = false;
  var FILENAME_MAX_LEN = 32;
  var HISTORY_CARD_FILENAME_MAX_LEN = 150;
  var STORAGE_KEY = "vt_download_selections";

  var STATUS_LABELS = {
    pending: "Pending",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  var TYPE_LABELS = {
    split: "Split",
    merge: "Merge",
  };

  var MOCK_JOBS = [
    {
      identifier: "job-001",
      type: "split",
      status: "processing",
      progress: 0.67,
      file_name: "clip_01_long_filename_demo.mp4",
      file_size: 524288000,
      duration: 3600,
      encode_summary: "1080P · CRF 23 · medium",
      error: "",
      created_at: hoursAgo(1),
      started_at: hoursAgo(0.9),
      finished_at: null,
      download_url: null,
    },
    {
      identifier: "job-002",
      type: "split",
      status: "pending",
      progress: 0,
      file_name: "interview_part2.mov",
      file_size: 209715200,
      duration: 1800,
      encode_summary: "720P · CRF 23 · fast",
      error: "",
      created_at: hoursAgo(0.2),
      started_at: null,
      finished_at: null,
      download_url: null,
    },
    {
      identifier: "job-003",
      type: "split",
      status: "completed",
      progress: 1,
      file_name: "tutorial_intro.mp4",
      file_size: 104857600,
      duration: 600,
      encode_summary: "1080P · CRF 23 · medium",
      error: "",
      created_at: hoursAgo(3),
      started_at: hoursAgo(2.9),
      finished_at: hoursAgo(2.5),
      download_url: "/api/jobs/job-003/files/1/download",
      output_files: [
        { id: 1, name: "tutorial_intro.mp4", size: 104857600, download_url: "/api/jobs/job-003/files/1/download" },
      ],
    },
    {
      identifier: "job-004",
      type: "split",
      status: "completed",
      progress: 1,
      file_name: "webinar_recording.mkv",
      file_size: 2147483648,
      duration: 7200,
      encode_summary: "keep · Copy audio",
      error: "",
      created_at: hoursAgo(5),
      started_at: hoursAgo(4.8),
      finished_at: hoursAgo(4),
      download_url: null,
      output_files: [
        { id: 10, name: "webinar_recording.mkv-1.mp4", size: 8388608, download_url: "/api/jobs/job-004/files/10/download" },
        { id: 11, name: "webinar_recording.mkv-2.mp4", size: 8388608, download_url: "/api/jobs/job-004/files/11/download" },
        { id: 12, name: "webinar_recording.mkv-3.mp4", size: 8388608, download_url: "/api/jobs/job-004/files/12/download" },
        { id: 13, name: "webinar_recording.mkv-4.mp4", size: 5242880, download_url: "/api/jobs/job-004/files/13/download" },
      ],
    },
    {
      identifier: "job-005",
      type: "split",
      status: "failed",
      progress: 0.42,
      file_name: "corrupt_video.avi",
      file_size: 52428800,
      duration: 300,
      encode_summary: "480P · CRF 25 · medium",
      error: "ffmpeg exited with code 1: Invalid data found when processing input",
      created_at: hoursAgo(8),
      started_at: hoursAgo(7.9),
      finished_at: hoursAgo(7.8),
      download_url: null,
    },
    {
      identifier: "job-006",
      type: "split",
      status: "completed",
      progress: 1,
      file_name: "short_clip.mp4",
      file_size: 15728640,
      duration: 45,
      encode_summary: "1080P · CRF 23 · medium",
      error: "",
      created_at: hoursAgo(26),
      started_at: hoursAgo(25.9),
      finished_at: hoursAgo(25.8),
      download_url: "/api/jobs/job-006/files/6/download",
      output_files: [
        { id: 6, name: "short_clip.mp4", size: 15728640, download_url: "/api/jobs/job-006/files/6/download" },
      ],
    },
    {
      identifier: "job-007",
      type: "split",
      status: "cancelled",
      progress: 0.15,
      file_name: "cancelled_job.mp4",
      file_size: 314572800,
      duration: 1200,
      encode_summary: "720P · CRF 23 · slow",
      error: "",
      created_at: hoursAgo(48),
      started_at: hoursAgo(47.9),
      finished_at: hoursAgo(47.5),
      download_url: null,
    },
    {
      identifier: "job-008",
      type: "split",
      status: "completed",
      progress: 1,
      file_name: "daily_vlog_ep12.mp4",
      file_size: 838860800,
      duration: 2400,
      encode_summary: "1080P · CRF 22 · medium",
      error: "",
      created_at: hoursAgo(72),
      started_at: hoursAgo(71.5),
      finished_at: hoursAgo(70),
      download_url: "/api/jobs/job-008/files/8/download",
      output_files: [
        { id: 8, name: "daily_vlog_ep12.mp4", size: 838860800, download_url: "/api/jobs/job-008/files/8/download" },
      ],
    },
  ];

  function hoursAgo(h) {
    return new Date(Date.now() - h * 3600000).toISOString();
  }

  var FILTER_STORAGE_KEY = "homeDashboard.jobFilters";

  var state = {
    filters: { period: "7d", status: "", page: 1 },
    pollTimer: null,
    loading: false,
    simulateError: false,
    downloadJob: null,
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function initHomeDashboard() {
    cacheElements();
    readFiltersFromURL();
    bindEvents();
    loadDashboard();
  }

  function cacheElements() {
    els.statsGrid = $("statsGrid");
    els.statsSkeleton = $("statsSkeleton");
    els.activeJobsList = $("activeJobsList");
    els.activeEmpty = $("activeEmpty");
    els.activeSkeleton = $("activeSkeleton");
    els.activeSection = $("activeSection");
    els.historyTableBody = $("historyTableBody");
    els.historyCardList = $("historyCardList");
    els.historyEmpty = $("historyEmpty");
    els.historyTableWrap = $("historyTableWrap");
    els.historySkeleton = $("historySkeleton");
    els.historyPagination = $("historyPagination");
    els.historyRange = $("historyRange");
    els.pageInfo = $("pageInfo");
    els.pagePrev = $("pagePrev");
    els.pageNext = $("pageNext");
    els.filterPeriod = $("filterPeriod");
    els.filterStatus = $("filterStatus");
    els.errorBanner = $("homeErrorBanner");
    els.errorMessage = $("homeErrorMessage");
    els.errorRetry = $("homeErrorRetry");
    els.errorModal = $("errorModal");
    els.errorModalMessage = $("errorModalMessage");
    els.errorModalClose = $("errorModalClose");
    els.downloadModal = $("downloadModal");
    els.downloadModalJobName = $("downloadModalJobName");
    els.downloadSelectAll = $("downloadSelectAll");
    els.downloadFileList = $("downloadFileList");
    els.downloadModalCancel = $("downloadModalCancel");
    els.downloadModalConfirm = $("downloadModalConfirm");
  }

  function bindEvents() {
    els.filterPeriod.addEventListener("change", applyFiltersFromUI);
    els.filterStatus.addEventListener("change", applyFiltersFromUI);

    els.pagePrev.addEventListener("click", function () {
      if (state.filters.page > 1) {
        state.filters.page--;
        persistFilters();
        loadHistory();
      }
    });

    els.pageNext.addEventListener("click", function () {
      state.filters.page++;
      persistFilters();
      loadHistory();
    });

    els.errorRetry.addEventListener("click", function () {
      state.simulateError = false;
      loadDashboard();
    });

    els.errorModalClose.addEventListener("click", function () {
      els.errorModal.close();
    });

    els.downloadModalCancel.addEventListener("click", function () {
      els.downloadModal.close();
    });

    els.downloadSelectAll.addEventListener("change", function () {
      if (!state.downloadJob) return;
      var checked = els.downloadSelectAll.checked;
      var fileIds = checked
        ? getOutputFiles(state.downloadJob).map(function (f) { return f.id; })
        : [];
      setSelectedForJob(state.downloadJob.identifier, fileIds);
      renderDownloadFileList(state.downloadJob);
    });

    els.downloadModalConfirm.addEventListener("click", function () {
      if (!state.downloadJob) return;
      var selected = getSelectedForJob(state.downloadJob.identifier);
      var files = getOutputFiles(state.downloadJob).filter(function (f) {
        return selected.has(f.id);
      });
      if (files.length === 0) {
        alert("Vui lòng chọn ít nhất một file.");
        return;
      }
      downloadFiles(files);
      els.downloadModal.close();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    });
  }

  function readFiltersFromURL() {
    var params = new URLSearchParams(window.location.search);
    var hasURLFilters =
      params.has("period") || params.has("status") || params.has("page");

    if (hasURLFilters) {
      state.filters.period = params.get("period") || "7d";
      state.filters.status = params.get("status") || "";
      state.filters.page = Math.max(1, parseInt(params.get("page") || "1", 10));
    } else {
      readFiltersFromStorage();
    }

    els.filterPeriod.value = state.filters.period;
    els.filterStatus.value = state.filters.status;
  }

  function readFiltersFromStorage() {
    try {
      var raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        state.filters.period = saved.period || "7d";
        state.filters.status = saved.status || "";
        state.filters.page = Math.max(1, parseInt(saved.page || "1", 10));
        return;
      }
    } catch (e) {
      /* ignore corrupt storage */
    }
    state.filters = { period: "7d", status: "", page: 1 };
  }

  function writeFiltersToStorage() {
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          period: state.filters.period,
          status: state.filters.status,
          page: state.filters.page,
        })
      );
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  function applyFiltersFromUI() {
    state.filters.period = els.filterPeriod.value;
    state.filters.status = els.filterStatus.value;
    state.filters.page = 1;
    persistFilters();
    loadHistory();
  }

  function persistFilters() {
    writeFiltersToStorage();
    writeFiltersToURL();
  }

  function writeFiltersToURL() {
    var params = new URLSearchParams();
    if (state.filters.period && state.filters.period !== "7d") {
      params.set("period", state.filters.period);
    }
    if (state.filters.status) {
      params.set("status", state.filters.status);
    }
    if (state.filters.page > 1) {
      params.set("page", String(state.filters.page));
    }
    var qs = params.toString();
    var url = qs ? "?" + qs : window.location.pathname;
    history.replaceState(null, "", url);
  }

  function loadDashboard() {
    setLoading(true);
    hideError();

    Promise.all([fetchStats(), fetchActiveJobs(), fetchJobs(buildJobsQuery())])
      .then(function (results) {
        setLoading(false);
        renderStats(results[0]);
        renderActiveJobs(results[1].items);
        renderHistory(results[2]);
        startPolling();
      })
      .catch(function (err) {
        setLoading(false);
        showError(err.message || "Không thể tải dữ liệu.");
        stopPolling();
      });
  }

  function loadHistory() {
    els.historySkeleton.hidden = false;
    els.historyTableWrap.hidden = true;
    els.historyEmpty.hidden = true;
    els.historyPagination.hidden = true;

    fetchJobs(buildJobsQuery())
      .then(function (data) {
        els.historySkeleton.hidden = true;
        renderHistory(data);
      })
      .catch(function (err) {
        els.historySkeleton.hidden = true;
        showError(err.message || "Không thể tải lịch sử job.");
      });
  }

  function buildJobsQuery() {
    return {
      period: state.filters.period,
      status: state.filters.status,
      page: state.filters.page,
      limit: PAGE_SIZE,
      active_only: false,
    };
  }

  function setLoading(loading) {
    state.loading = loading;
    els.statsGrid.hidden = loading;
    els.statsSkeleton.style.display = !loading ? "none" : "block";
    els.activeJobsList.hidden = loading;
    els.activeSkeleton.hidden = !loading;
    els.historyTableWrap.hidden = loading;
    els.historySkeleton.hidden = !loading;
    if (loading) {
      els.historyEmpty.hidden = true;
      els.historyPagination.hidden = true;
      els.activeEmpty.hidden = true;
    }
  }

  function showError(msg) {
    els.errorMessage.textContent = msg;
    els.errorBanner.style.display = "block";
  }

  function hideError() {
    els.errorBanner.style.display = "none";
  }

  /* --- API layer: swap USE_MOCK=false when backend is ready --- */

  function fetchStats() {
    if (USE_MOCK) {
      return mockDelay().then(function () {
        if (state.simulateError) throw new Error("Mock API error");
        return computeMockStats();
      });
    }
    return fetch("/api/jobs/stats", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("Lỗi tải thống kê (" + res.status + ")");
        return res.json();
      });
  }

  function fetchActiveJobs() {
    if (USE_MOCK) {
      return mockDelay(200).then(function () {
        var active = MOCK_JOBS.filter(function (j) {
          return j.status === "pending" || j.status === "processing";
        });
        return { items: active, total: active.length };
      });
    }
    var qs = new URLSearchParams({ active_only: "true" });
    return fetch("/api/jobs?" + qs, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("Lỗi tải job đang chạy (" + res.status + ")");
        return res.json();
      });
  }

  function fetchJobs(query) {
    if (USE_MOCK) {
      return mockDelay(300).then(function () {
        if (state.simulateError) throw new Error("Mock API error");
        return filterMockJobs(query);
      });
    }
    var qs = new URLSearchParams();
    if (query.status) qs.set("status", query.status);
    if (query.page) qs.set("page", String(query.page));
    if (query.limit) qs.set("limit", String(query.limit));
    if (query.active_only) qs.set("active_only", "true");
    var range = periodToDateRange(query.period);
    if (range.from) qs.set("from", range.from);
    if (range.to) qs.set("to", range.to);
    return fetch("/api/jobs?" + qs, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("Lỗi tải danh sách job (" + res.status + ")");
        return res.json();
      });
  }

  function cancelJob(identifier) {
    if (USE_MOCK) {
      return mockDelay(400).then(function () {
        var job = MOCK_JOBS.find(function (j) { return j.identifier === identifier; });
        if (job) {
          job.status = "cancelled";
          job.finished_at = new Date().toISOString();
        }
      });
    }
    return fetch("/job/cancel?jobIdentifier=" + encodeURIComponent(identifier), {
      method: "POST",
      credentials: "same-origin",
    }).then(function (res) {
      if (!res.ok) throw new Error("Không thể hủy job (" + res.status + ")");
    });
  }

  function mockDelay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms || 400);
    });
  }

  function computeMockStats() {
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var weekAgo = new Date(now.getTime() - 7 * 86400000);

    var processing = 0;
    var completedToday = 0;
    var failedWeek = 0;
    var total = MOCK_JOBS.length;
    var encodeDurations = [];

    MOCK_JOBS.forEach(function (j) {
      if (j.status === "pending" || j.status === "processing") processing++;
      if (j.status === "completed" && j.finished_at && new Date(j.finished_at) >= todayStart) {
        completedToday++;
      }
      if (j.status === "failed" && j.created_at && new Date(j.created_at) >= weekAgo) {
        failedWeek++;
      }
      if (j.status === "completed" && j.started_at && j.finished_at) {
        var created = new Date(j.created_at);
        if (created >= weekAgo) {
          encodeDurations.push(
            (new Date(j.finished_at) - new Date(j.started_at)) / 1000
          );
        }
      }
    });

    var avgEncode = 0;
    if (encodeDurations.length > 0) {
      avgEncode = Math.round(
        encodeDurations.reduce(function (a, b) { return a + b; }, 0) / encodeDurations.length
      );
    }

    return {
      processing: processing,
      completed_today: completedToday,
      failed: failedWeek,
      total: total,
      avg_encode_seconds: avgEncode,
    };
  }

  function filterMockJobs(query) {
    var filtered = MOCK_JOBS.slice();
    var range = periodToDateRange(query.period);

    if (range.from) {
      filtered = filtered.filter(function (j) {
        return new Date(j.created_at) >= new Date(range.from);
      });
    }
    if (range.to) {
      filtered = filtered.filter(function (j) {
        return new Date(j.created_at) <= new Date(range.to);
      });
    }
    if (query.status) {
      filtered = filtered.filter(function (j) {
        return j.status === query.status;
      });
    }
    if (query.active_only) {
      filtered = filtered.filter(function (j) {
        return j.status === "pending" || j.status === "processing";
      });
    }

    filtered.sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    var total = filtered.length;
    var page = query.page || 1;
    var limit = query.limit || PAGE_SIZE;
    var start = (page - 1) * limit;
    var items = filtered.slice(start, start + limit);

    return {
      items: items,
      total: total,
      page: page,
      limit: limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  function periodToDateRange(period) {
    var now = new Date();
    var to = now.toISOString();
    if (!period || period === "all") return { from: null, to: null };
    if (period === "today") {
      var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { from: start.toISOString(), to: to };
    }
    if (period === "7d") {
      return { from: new Date(now.getTime() - 7 * 86400000).toISOString(), to: to };
    }
    if (period === "30d") {
      return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: to };
    }
    return { from: null, to: null };
  }

  /* --- Rendering --- */

  function renderStats(stats) {
    setStatValue("processing", stats.processing);
    setStatValue("completed_today", stats.completed_today);
    setStatValue("failed", stats.failed);
    setStatValue("total", stats.total);
    var avgEl = document.querySelector('[data-stat="avg_encode"]');
    if (avgEl) {
      avgEl.textContent = stats.avg_encode_seconds
        ? formatDuration(stats.avg_encode_seconds)
        : "—";
    }
  }

  function setStatValue(key, value) {
    var el = document.querySelector('[data-stat="' + key + '"]');
    if (el) el.textContent = value != null ? value : "—";
  }

  function renderActiveJobs(jobs) {
    els.activeJobsList.innerHTML = "";

    if (!jobs || jobs.length === 0) {
      els.activeEmpty.hidden = false;
      els.activeJobsList.hidden = true;
      stopPolling();
      return;
    }

    els.activeEmpty.hidden = true;
    els.activeJobsList.hidden = false;

    jobs.forEach(function (job) {
      els.activeJobsList.appendChild(buildJobRow(job));
    });
  }

  function buildJobRow(job) {
    var row = document.createElement("div");
    row.className = "job-row";
    row.dataset.identifier = job.identifier;

    var pct = Math.round((job.progress || 0) * 100);
    var elapsed = formatElapsed(job.started_at);

    row.innerHTML =
      '<div class="job-row__header">' +
        '<span class="job-row__filename" title="' + escapeHtml(job.file_name) + '">' +
          escapeHtml(truncateFileName(job.file_name)) +
        "</span>" +
        '<div class="job-row__badges">' +
          badgeHtml(job.type, "type") +
          badgeHtml(job.status, "status") +
        "</div>" +
      "</div>" +
      '<div class="job-row__progress-wrap">' +
        '<div class="progress-bar"><div class="progress-bar__fill" style="width:' + pct + '%"></div></div>' +
        '<span class="progress-bar__label">' + pct + "%</span>" +
      "</div>" +
      '<div class="job-row__meta">' +
        (elapsed ? elapsed + " · " : "") +
        escapeHtml(job.encode_summary || "") +
      "</div>";

    if (job.status === "processing" || job.status === "pending") {
      var footer = document.createElement("div");
      footer.className = "job-row__footer";
      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn--danger btn--sm";
      cancelBtn.textContent = "Hủy";
      cancelBtn.addEventListener("click", function () {
        handleCancel(job.identifier);
      });
      footer.appendChild(cancelBtn);
      row.appendChild(footer);
    }

    return row;
  }

  function renderHistory(data) {
    var items = data.items || [];
    var total = data.total || 0;
    var page = data.page || 1;
    var limit = data.limit || PAGE_SIZE;
    var totalPages = data.total_pages || Math.max(1, Math.ceil(total / limit));

    els.historyTableBody.innerHTML = "";
    els.historyCardList.innerHTML = "";

    if (items.length === 0) {
      els.historyEmpty.hidden = false;
      els.historyTableWrap.hidden = true;
      els.historyPagination.hidden = true;
      return;
    }

    els.historyEmpty.hidden = true;
    els.historyTableWrap.hidden = false;

    items.forEach(function (job) {
      els.historyTableBody.appendChild(buildTableRow(job));
      els.historyCardList.appendChild(buildHistoryCard(job));
    });

    if (totalPages > 1 || total > limit) {
      els.historyPagination.hidden = false;
      var start = (page - 1) * limit + 1;
      var end = Math.min(page * limit, total);
      els.historyRange.textContent = "Hiển thị " + start + "–" + end + " / " + total + " job";
      els.pageInfo.textContent = "Trang " + page + " / " + totalPages;
      els.pagePrev.disabled = page <= 1;
      els.pageNext.disabled = page >= totalPages;
      state.filters.page = page;
    } else {
      els.historyPagination.hidden = total === 0;
      if (total > 0) {
        els.historyRange.textContent = "Hiển thị " + total + " / " + total + " job";
        els.pageInfo.textContent = "Trang 1 / 1";
        els.pagePrev.disabled = true;
        els.pageNext.disabled = true;
        els.historyPagination.hidden = false;
      }
    }
  }

  function buildTableRow(job) {
    var tr = document.createElement("tr");
    var pct =
      job.status === "completed" || job.status === "failed" || job.status === "cancelled"
        ? "—"
        : Math.round((job.progress || 0) * 100) + "%";

    tr.innerHTML =
      '<td class="cell-filename" title="' + escapeHtml(job.file_name) + '">' +
        escapeHtml(truncateFileName(job.file_name)) +
      "</td>" +
      "<td>" + badgeHtml(job.type, "type") + "</td>" +
      "<td>" + badgeHtml(job.status, "status") + "</td>" +
      "<td>" + pct + "</td>" +
      "<td>" + formatDateTime(job.created_at) + "</td>" +
      "<td>" + (job.finished_at ? formatDateTime(job.finished_at) : "—") + "</td>" +
      '<td class="cell-actions"><div class="cell-actions__inner">' + actionButtonsHtml(job) + "</div></td>";

    bindRowActions(tr, job);
    return tr;
  }

  function buildHistoryCard(job) {
    var card = document.createElement("div");
    card.className = "history-card";

    var pct =
      job.status === "completed" || job.status === "failed" || job.status === "cancelled"
        ? "—"
        : Math.round((job.progress || 0) * 100) + "%";

    card.innerHTML =
      '<div class="history-card__filename" title="' + escapeHtml(job.file_name) + '">' +
        escapeHtml(truncateFileName(job.file_name, HISTORY_CARD_FILENAME_MAX_LEN)) +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Loại</span>' +
        badgeHtml(job.type, "type") +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Trạng thái</span>' +
        badgeHtml(job.status, "status") +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Tiến độ</span>' +
        "<span>" + pct + "</span>" +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Tạo lúc</span>' +
        "<span>" + formatDateTime(job.created_at) + "</span>" +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Thao tác</span>' +
        '<span class="cell-actions__inner">' + actionButtonsHtml(job) + "</span>" +
      "</div>";

    bindRowActions(card, job);
    return card;
  }

  function getOutputFiles(job) {
    if (job.output_files && job.output_files.length > 0) {
      return job.output_files;
    }
    if (job.download_url) {
      return [{ id: 0, name: job.file_name, size: job.file_size, download_url: job.download_url }];
    }
    return [];
  }

  function actionButtonsHtml(job) {
    var parts = [];
    var outputs = getOutputFiles(job);

    if (job.status === "completed" && outputs.length === 1) {
      parts.push(
        '<a href="' + escapeHtml(outputs[0].download_url) + '" class="btn btn--ghost" download>Tải xuống</a>'
      );
    }
    if (job.status === "completed" && outputs.length > 1) {
      parts.push(
        '<button type="button" class="btn btn--ghost btn-pick-download">Chọn file tải (' + outputs.length + ")</button>"
      );
    }
    if (job.status === "failed" && job.error) {
      parts.push('<button type="button" class="btn btn--ghost btn-view-error">Xem lỗi</button>');
    }
    if (job.status === "processing" || job.status === "pending") {
      parts.push('<button type="button" class="btn btn--danger btn--sm btn-cancel-job">Hủy</button>');
    }
    return parts.length > 0 ? parts.join(" ") : "—";
  }

  function bindRowActions(container, job) {
    var pickBtn = container.querySelector(".btn-pick-download");
    if (pickBtn) {
      pickBtn.addEventListener("click", function () {
        openDownloadModal(job);
      });
    }
    var errorBtn = container.querySelector(".btn-view-error");
    if (errorBtn) {
      errorBtn.addEventListener("click", function () {
        showErrorModal(job.error);
      });
    }
    var cancelBtn = container.querySelector(".btn-cancel-job");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        handleCancel(job.identifier);
      });
    }
  }

  function handleCancel(identifier) {
    if (!confirm("Bạn có chắc muốn hủy job này?")) return;
    cancelJob(identifier)
      .then(function () {
        loadDashboard();
      })
      .catch(function (err) {
        alert(err.message || "Không thể hủy job.");
      });
  }

  function showErrorModal(message) {
    els.errorModalMessage.textContent = message || "Không có thông tin lỗi.";
    els.errorModal.showModal();
  }

  /* --- Polling --- */

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      refreshActiveAndStats();
      if (USE_MOCK) simulateMockProgress();
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function refreshActiveAndStats() {
    Promise.all([fetchStats(), fetchActiveJobs(),fetchJobs(buildJobsQuery())])
      .then(function (results) {
        renderStats(results[0]);
        renderActiveJobs(results[1].items);
        renderHistory(results[2]);
        if (!results[1].items || results[1].items.length === 0) {
          stopPolling();
        }
      })
      .catch(function () {
        /* silent on poll failure */
      });
  }

  function simulateMockProgress() {
    MOCK_JOBS.forEach(function (job) {
      if (job.status === "processing" && job.progress < 1) {
        job.progress = Math.min(1, job.progress + 0.03);
        if (job.progress >= 1) {
          job.status = "completed";
          job.finished_at = new Date().toISOString();
          job.output_files = [
            { id: 99, name: job.file_name + "-1.mp4", size: 1048576, download_url: "/api/jobs/" + job.identifier + "/files/99/download" },
          ];
          job.download_url = job.output_files[0].download_url;
        }
      }
    });
    if (state.filters.page === 1) {
      fetchJobs(buildJobsQuery()).then(function (data) {
        renderHistory(data);
      });
    }
  }

  /* --- Formatters --- */

  function formatDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    var pad = function (n) { return n < 10 ? "0" + n : String(n); };
    return (
      pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  function formatDuration(seconds) {
    if (seconds < 60) return seconds + "s";
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    if (m < 60) return m + "m " + s + "s";
    var h = Math.floor(m / 60);
    m = m % 60;
    return h + "h " + m + "m";
  }

  function formatElapsed(startedAt) {
    if (!startedAt) return "";
    var sec = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    if (sec < 0) return "";
    return formatDuration(sec) + " đã chạy";
  }

  function badgeHtml(value, kind) {
    var label = kind === "type" ? (TYPE_LABELS[value] || value) : (STATUS_LABELS[value] || value);
    var cls = kind === "type" ? "badge--type" : "badge--" + value;
    return '<span class="badge ' + cls + '">' + escapeHtml(label) + "</span>";
  }

  function truncateFileName(name, maxLen) {
    maxLen = maxLen || FILENAME_MAX_LEN;
    if (!name || name.length <= maxLen) return name || "";
    return name.slice(0, maxLen - 7) + "..." + name.slice(-7);
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes < 1) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  }

  function loadSelections() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveSelections(map) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
      /* QuotaExceededError — skip persist */
    }
  }

  function getSelectedForJob(jobId) {
    var map = loadSelections();
    var ids = map[jobId] || [];
    return new Set(ids);
  }

  function setSelectedForJob(jobId, fileIds) {
    var map = loadSelections();
    map[jobId] = fileIds || [];
    saveSelections(map);
  }

  function openDownloadModal(job) {
    state.downloadJob = job;
    els.downloadModalJobName.textContent = truncateFileName(job.file_name, 48);
    els.downloadModalJobName.title = job.file_name || "";
    renderDownloadFileList(job);
    els.downloadModal.showModal();
  }

  function renderDownloadFileList(job) {
    var files = getOutputFiles(job);
    var map = loadSelections();
    var selected;

    if (!(job.identifier in map)) {
      var allIds = files.map(function (f) { return f.id; });
      setSelectedForJob(job.identifier, allIds);
      selected = new Set(allIds);
    } else {
      selected = getSelectedForJob(job.identifier);
    }

    els.downloadFileList.innerHTML = "";

    files.forEach(function (file) {
      var li = document.createElement("li");
      li.className = "download-modal__item";

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(file.id);
      cb.addEventListener("change", function () {
        var current = getSelectedForJob(job.identifier);
        if (cb.checked) {
          current.add(file.id);
        } else {
          current.delete(file.id);
        }
        setSelectedForJob(job.identifier, Array.from(current));
        updateSelectAllCheckbox(job);
      });

      var nameSpan = document.createElement("span");
      nameSpan.className = "download-modal__item-name";
      nameSpan.textContent = truncateFileName(file.name);
      nameSpan.title = file.name;

      var sizeSpan = document.createElement("span");
      sizeSpan.className = "download-modal__item-size";
      sizeSpan.textContent = formatFileSize(file.size);

      li.appendChild(cb);
      li.appendChild(nameSpan);
      li.appendChild(sizeSpan);
      li.addEventListener("click", function (e) {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      });

      els.downloadFileList.appendChild(li);
    });

    updateSelectAllCheckbox(job);
  }

  function updateSelectAllCheckbox(job) {
    var files = getOutputFiles(job);
    var selected = getSelectedForJob(job.identifier);
    els.downloadSelectAll.checked = files.length > 0 && files.every(function (f) {
      return selected.has(f.id);
    });
    els.downloadSelectAll.indeterminate =
      selected.size > 0 && selected.size < files.length;
  }

  function downloadFiles(files) {
    files.forEach(function (file, i) {
      setTimeout(function () {
        var a = document.createElement("a");
        a.href = file.download_url;
        a.download = file.name || "";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 300);
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.initHomeDashboard = initHomeDashboard;
  window.HomeDashboardAPI = {
    USE_MOCK: USE_MOCK,
    setUseMock: function (val) { USE_MOCK = val; },
    setSimulateError: function (val) { state.simulateError = val; },
    reload: loadDashboard,
  };
})();
