(function () {
  "use strict";

  var PAGE_SIZE = 20;
  var POLL_INTERVAL_MS = 10000;
  var FILTER_STORAGE_KEY = "adminDashboard.jobFilters";

  var OUTPUT_TYPE_LABELS = {
    splits: "Splits",
    merges: "Merges",
    gifs: "GIFs",
    "extract-audio": "Extract audio",
    editor: "Editor",
  };

  var state = {
    filters: { period: "7d", status: "", type: "", page: 1 },
    pollTimer: null,
    loading: false,
  };

  var els = {};

  function initAdminDashboard() {
    els = {
      errorBanner: document.getElementById("adminErrorBanner"),
      errorMessage: document.getElementById("adminErrorMessage"),
      errorRetry: document.getElementById("adminErrorRetry"),
      errorModal: document.getElementById("errorModal"),
      errorModalMessage: document.getElementById("errorModalMessage"),
      errorModalClose: document.getElementById("errorModalClose"),
      jobStatsGrid: document.getElementById("jobStatsGrid"),
      jobStatsSkeleton: document.getElementById("jobStatsSkeleton"),
      storageScannedAt: document.getElementById("storageScannedAt"),
      storageRefreshBtn: document.getElementById("storageRefreshBtn"),
      storageStatsGrid: document.getElementById("storageStatsGrid"),
      storageDiskInfo: document.getElementById("storageDiskInfo"),
      storageBreakdown: document.getElementById("storageBreakdown"),
      filterPeriod: document.getElementById("filterPeriod"),
      filterStatus: document.getElementById("filterStatus"),
      filterType: document.getElementById("filterType"),
      historyEmpty: document.getElementById("historyEmpty"),
      historyTableWrap: document.getElementById("historyTableWrap"),
      historyTableBody: document.getElementById("historyTableBody"),
      historyCardList: document.getElementById("historyCardList"),
      historySkeleton: document.getElementById("historySkeleton"),
      historyPagination: document.getElementById("historyPagination"),
      historyRange: document.getElementById("historyRange"),
      pageInfo: document.getElementById("pageInfo"),
      pagePrev: document.getElementById("pagePrev"),
      pageNext: document.getElementById("pageNext"),
    };

    JobUI.init({
      modals: {
        errorModal: els.errorModal,
        errorModalMessage: els.errorModalMessage,
        errorModalClose: els.errorModalClose,
      },
    });
    var errorModalRetry = document.getElementById("errorModalRetry");
    if (errorModalRetry) errorModalRetry.hidden = true;

    readFiltersFromURL();

    els.filterPeriod.addEventListener("change", applyFiltersFromUI);
    els.filterStatus.addEventListener("change", applyFiltersFromUI);
    els.filterType.addEventListener("change", applyFiltersFromUI);
    els.errorRetry.addEventListener("click", loadDashboard);
    els.storageRefreshBtn.addEventListener("click", refreshStorage);
    els.pagePrev.addEventListener("click", function () {
      if (state.filters.page > 1) {
        state.filters.page--;
        writeFiltersToURL();
        loadHistory();
      }
    });
    els.pageNext.addEventListener("click", function () {
      if (els.pageNext.disabled) return;
      state.filters.page++;
      writeFiltersToURL();
      loadHistory();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        refreshStats();
      }
    });

    loadDashboard();
  }

  function readFiltersFromURL() {
    var params = new URLSearchParams(window.location.search);
    var hasURLFilters =
      params.has("period") || params.has("status") || params.has("type") || params.has("page");

    if (hasURLFilters) {
      state.filters.period = params.get("period") || "7d";
      state.filters.status = params.get("status") || "";
      state.filters.type = params.get("type") || "";
      state.filters.page = Math.max(1, parseInt(params.get("page") || "1", 10));
      writeFiltersToStorage();
    } else {
      readFiltersFromStorage();
    }

    els.filterPeriod.value = state.filters.period;
    els.filterStatus.value = state.filters.status;
    els.filterType.value = state.filters.type;
  }

  function readFiltersFromStorage() {
    try {
      var raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        state.filters.period = saved.period || "7d";
        state.filters.status = saved.status || "";
        state.filters.type = saved.type || "";
        state.filters.page = 1;
        return;
      }
    } catch (e) {
      /* ignore corrupt storage */
    }
    state.filters = { period: "7d", status: "", type: "", page: 1 };
  }

  function writeFiltersToStorage() {
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          period: state.filters.period,
          status: state.filters.status,
          type: state.filters.type,
        })
      );
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  function writeFiltersToURL() {
    var params = new URLSearchParams();
    if (state.filters.period && state.filters.period !== "7d") {
      params.set("period", state.filters.period);
    }
    if (state.filters.status) {
      params.set("status", state.filters.status);
    }
    if (state.filters.type) {
      params.set("type", state.filters.type);
    }
    if (state.filters.page > 1) {
      params.set("page", String(state.filters.page));
    }
    var qs = params.toString();
    var url = qs ? "?" + qs : window.location.pathname;
    history.replaceState(null, "", url);
  }

  function persistFilters() {
    writeFiltersToStorage();
    writeFiltersToURL();
  }

  function applyFiltersFromUI() {
    state.filters.period = els.filterPeriod.value;
    state.filters.status = els.filterStatus.value;
    state.filters.type = els.filterType.value;
    state.filters.page = 1;
    persistFilters();
    loadHistory();
  }

  function loadDashboard() {
    setLoading(true);
    hideError();

    Promise.all([fetchStats(), fetchJobs(buildJobsQuery())])
      .then(function (results) {
        setLoading(false);
        renderStats(results[0]);
        renderStorage(results[0].storage);
        renderHistory(results[1]);
        startPolling();
      })
      .catch(function (err) {
        setLoading(false);
        showError(err.message || "Không thể tải dữ liệu.");
        stopPolling();
      });
  }

  function loadHistory() {
    els.historySkeleton.style.display = "block";
    els.historyTableWrap.style.display = "none";
    els.historyEmpty.style.display = "none";
    els.historyPagination.style.display = "none";

    fetchJobs(buildJobsQuery())
      .then(function (data) {
        els.historySkeleton.style.display = "none";
        renderHistory(data);    
      })
      .catch(function (err) {
        els.historySkeleton.style.display = "none";
        showError(err.message || "Không thể tải danh sách job.");
      });
  }

  function refreshStorage() {
    els.storageRefreshBtn.disabled = true;
    fetch("/admin/api/storage/refresh", {
      method: "POST",
      credentials: "same-origin",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Lỗi quét lại dung lượng (" + res.status + ")");
        return res.json();
      })
      .then(function (storage) {
        renderStorage(storage);
      })
      .catch(function (err) {
        showError(err.message || "Không thể quét lại dung lượng.");
      })
      .finally(function () {
        els.storageRefreshBtn.disabled = false;
      });
  }

  function buildJobsQuery() {
    return {
      period: state.filters.period,
      status: state.filters.status,
      type: state.filters.type,
      page: state.filters.page,
      limit: PAGE_SIZE,
    };
  }

  function setLoading(loading) {
    state.loading = loading;
    els.jobStatsGrid.style.display = loading ? "none" : "grid";
    els.jobStatsSkeleton.style.display = loading ? "block" : "none";
    els.storageStatsGrid.style.display = loading ? "none" : " ";
    els.historyTableWrap.style.display = loading ? "none" : "block";
    els.historySkeleton.style.display = loading ? "block" : "none";
    els.historyEmpty.style.display = loading ? "none" : "block";
    els.historyPagination.style.display = loading ? "none" : "flex";
  }

  function showError(msg) {
    els.errorMessage.textContent = msg;
    els.errorBanner.style.display = "block";
  }

  function hideError() {
    els.errorBanner.style.display = "none";
  }

  function fetchStats() {
    return fetch("/admin/api/jobs/stats", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("Lỗi tải thống kê (" + res.status + ")");
        return res.json();
      });
  }

  function fetchJobs(query) {
    var qs = new URLSearchParams();
    if (query.status) qs.set("status", query.status);
    if (query.type) qs.set("type", query.type);
    if (query.page) qs.set("page", String(query.page));
    if (query.limit) qs.set("limit", String(query.limit));
    var range = periodToDateRange(query.period);
    if (range.from) qs.set("from", range.from);
    if (range.to) qs.set("to", range.to);
    return fetch("/admin/api/jobs?" + qs, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("Lỗi tải danh sách job (" + res.status + ")");
        return res.json();
      });
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

  function renderStorage(storage) {
    if (!storage) return;

    setStorageValue("total", storage.total_bytes);
    setStorageValue("inputs", storage.inputs_bytes);
    setStorageValue("output", storage.output_bytes);
    setStorageValue("tmp", storage.tmp_bytes);

    if (storage.scanned_at) {
      els.storageScannedAt.textContent =
        "Quét lúc: " + JobUI.formatDateTime(storage.scanned_at) +
        (storage.scan_duration_ms != null ? " (" + storage.scan_duration_ms + "ms)" : "");
    }

    if (storage.disk_total_bytes > 0) {
      els.storageDiskInfo.textContent =
        "Ổ đĩa: " + formatBytes(storage.disk_total_bytes - storage.disk_free_bytes) +
        " / " + formatBytes(storage.disk_total_bytes) +
        " đã dùng · còn trống " + formatBytes(storage.disk_free_bytes);
    } else {
      els.storageDiskInfo.textContent = "";
    }

    els.storageBreakdown.innerHTML = "";
    var byType = storage.output_by_type || {};
    Object.keys(byType).forEach(function (key) {
      var item = document.createElement("div");
      item.className = "storage-breakdown__item";
      item.innerHTML =
        '<span class="storage-breakdown__label">' + JobUI.escapeHtml(OUTPUT_TYPE_LABELS[key] || key) + "</span>" +
        '<span class="storage-breakdown__value">' + formatBytes(byType[key]) + "</span>";
      els.storageBreakdown.appendChild(item);
    });
  }

  function setStatValue(key, value) {
    var el = document.querySelector('[data-stat="' + key + '"]');
    if (el) el.textContent = value != null ? value : "—";
  }

  function setStorageValue(key, bytes) {
    var el = document.querySelector('[data-storage="' + key + '"]');
    if (el) el.textContent = formatBytes(bytes);
  }

  function renderHistory(data) {
    var items = data.items || [];

    els.historyTableBody.innerHTML = "";
    els.historyCardList.innerHTML = "";

    if (items.length === 0) {
      els.historyEmpty.style.display = "block";
      els.historyTableWrap.style.display = "none";
      els.historyPagination.style.display = "none";
      return;
    }

    els.historyEmpty.style.display = "none";
    els.historyTableWrap.style.display = "block";

    items.forEach(function (job) {
      els.historyTableBody.appendChild(buildTableRow(job));
      els.historyCardList.appendChild(buildHistoryCard(job));
    });

    JobUI.updatePagination(
      {
        pagination: els.historyPagination,
        range: els.historyRange,
        pageInfo: els.pageInfo,
        pagePrev: els.pagePrev,
        pageNext: els.pageNext,
      },
      data,
      function (page) {
        state.filters.page = page;
      }
    );
  }

  function buildTableRow(job) {
    var tr = document.createElement("tr");
    tr.dataset.identifier = job.identifier;
    var pct = progressLabel(job);

    tr.innerHTML =
      '<td class="cell-filename" title="' + JobUI.escapeHtml(job.file_name) + '">' +
        JobUI.escapeHtml(JobUI.truncateFileName(job.file_name)) +
      "</td>" +
      "<td>" + JobUI.badgeHtml(job.type, "type") + "</td>" +
      "<td>" + JobUI.badgeHtml(job.status, "status") + "</td>" +
      "<td>" + pct + "</td>" +
      '<td class="cell-user-id" title="' + JobUI.escapeHtml(job.user_id) + '">' +
        JobUI.escapeHtml(truncateUserId(job.user_id)) +
      "</td>" +
      "<td>" + JobUI.formatRelativeTime(job.created_at) + "</td>" +
      "<td>" + (job.finished_at ? JobUI.formatRelativeTime(job.finished_at) : "—") + "</td>" +
      '<td class="cell-actions"><div class="cell-actions__inner">' + JobUI.actionButtonsHtml(job) + "</div></td>";

    JobUI.bindRowActions(tr, job);
    return tr;
  }

  function buildHistoryCard(job) {
    var card = document.createElement("div");
    card.className = "history-card";
    card.dataset.identifier = job.identifier;
    var pct = progressLabel(job);

    card.innerHTML =
      '<div class="history-card__filename" title="' + JobUI.escapeHtml(job.file_name) + '">' +
        JobUI.escapeHtml(JobUI.truncateFileName(job.file_name, 150)) +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Loại</span>' +
        JobUI.badgeHtml(job.type, "type") +
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
        '<span class="history-card__label">User ID</span>' +
        "<span>" + JobUI.escapeHtml(truncateUserId(job.user_id)) + "</span>" +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Tạo lúc</span>' +
        "<span>" + JobUI.formatRelativeTime(job.created_at) + "</span>" +
      "</div>" +
      '<div class="history-card__row">' +
        '<span class="history-card__label">Thao tác</span>' +
        '<span class="cell-actions__inner">' + JobUI.actionButtonsHtml(job) + "</span>" +
      "</div>";

    JobUI.bindRowActions(card, job);
    return card;
  }

  function progressLabel(job) {
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return "—";
    }
    return Math.round((job.progress || 0) * 100) + "%";
  }

  function truncateUserId(id) {
    if (!id) return "—";
    if (id.length <= 12) return id;
    return id.slice(0, 8) + "…" + id.slice(-4);
  }

  function formatBytes(bytes) {
    if (bytes == null || bytes < 0) return "—";
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < Math.pow(1024, 2)) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < Math.pow(1024, 3)) return (bytes / Math.pow(1024, 2)).toFixed(2) + " MB";
    return (bytes / Math.pow(1024, 3)).toFixed(2) + " GB";
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

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      refreshStats();
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function refreshStats() {
    fetchStats()
      .then(function (stats) {
        renderStats(stats);
        renderStorage(stats.storage);
      })
      .catch(function () {
        /* silent on poll failure */
      });
  }

  window.initAdminDashboard = initAdminDashboard;
})();
