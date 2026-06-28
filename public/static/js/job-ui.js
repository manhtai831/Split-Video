(function () {
  "use strict";

  var FILENAME_MAX_LEN = 32;
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

  var modals = {};
  var onCancelSuccess = function () {};
  var downloadJob = null;

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

  function init(options) {
    modals = options.modals || {};
    onCancelSuccess = options.onCancelSuccess || function () {};

    if (modals.errorModalClose) {
      modals.errorModalClose.addEventListener("click", function () {
        modals.errorModal.close();
      });
    }

    if (modals.downloadModalCancel) {
      modals.downloadModalCancel.addEventListener("click", function () {
        modals.downloadModal.close();
      });
    }

    if (modals.downloadSelectAll) {
      modals.downloadSelectAll.addEventListener("change", function () {
        if (!downloadJob) return;
        var checked = modals.downloadSelectAll.checked;
        var fileIds = checked
          ? getOutputFiles(downloadJob).map(function (f) { return f.id; })
          : [];
        setSelectedForJob(downloadJob.identifier, fileIds);
        renderDownloadFileList(downloadJob);
      });
    }

    if (modals.downloadModalConfirm) {
      modals.downloadModalConfirm.addEventListener("click", function () {
        if (!downloadJob) return;
        var selected = getSelectedForJob(downloadJob.identifier);
        var files = getOutputFiles(downloadJob).filter(function (f) {
          return selected.has(f.id);
        });
        if (files.length === 0) {
          alert("Vui lòng chọn ít nhất một file.");
          return;
        }
        downloadFiles(files);
        modals.downloadModal.close();
      });
    }
  }

  function fetchJobs(query) {
    var qs = new URLSearchParams();
    if (query.status) qs.set("status", query.status);
    if (query.type) qs.set("type", query.type);
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
    return fetch("/job/cancel?jobIdentifier=" + encodeURIComponent(identifier), {
      method: "POST",
      credentials: "same-origin",
    }).then(function (res) {
      if (!res.ok) throw new Error("Không thể hủy job (" + res.status + ")");
    });
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

  var ICON_DOWNLOAD =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" y1="15" x2="12" y2="3"/>' +
    "</svg>";

  var ICON_FILES =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="12" y1="18" x2="12" y2="12"/>' +
    '<line x1="9" y1="15" x2="15" y2="15"/>' +
    "</svg>";

  var ICON_ERROR =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/>' +
    '<line x1="12" y1="8" x2="12" y2="12"/>' +
    '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
    "</svg>";

  var ICON_CANCEL =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<line x1="18" y1="6" x2="6" y2="18"/>' +
    '<line x1="6" y1="6" x2="18" y2="18"/>' +
    "</svg>";

  function iconButtonHtml(tag, className, label, icon, extraAttrs, innerSuffix) {
    var attrs =
      'class="btn btn--icon ' + className + '" title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '"';
    if (extraAttrs) attrs += " " + extraAttrs;
    return "<" + tag + " " + attrs + ">" + icon + (innerSuffix || "") + "</" + tag + ">";
  }

  function actionButtonsHtml(job) {
    var parts = [];
    var outputs = getOutputFiles(job);

    if (job.status === "completed" && outputs.length === 1) {
      parts.push(
        iconButtonHtml(
          "a",
          "btn--ghost",
          "Tải xuống",
          ICON_DOWNLOAD,
          'href="' + escapeHtml(outputs[0].download_url) + '" download'
        )
      );
    }
    if (job.status === "completed" && outputs.length > 1) {
      var pickLabel = "Chọn file tải (" + outputs.length + ")";
      parts.push(
        iconButtonHtml(
          "button",
          "btn--ghost btn-pick-download",
          pickLabel,
          ICON_FILES,
          'type="button"',
          '<span class="btn__badge" aria-hidden="true">' + outputs.length + "</span>"
        )
      );
    }
    if (job.status === "failed" && job.error) {
      parts.push(iconButtonHtml("button", "btn--ghost btn-view-error", "Xem lỗi", ICON_ERROR, 'type="button"'));
    }
    if (job.status === "processing" || job.status === "pending") {
      parts.push(
        iconButtonHtml("button", "btn--danger btn-cancel-job", "Hủy", ICON_CANCEL, 'type="button"')
      );
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
        showError(job.error);
      });
    }
    var cancelBtn = container.querySelector(".btn-cancel-job");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        if (!confirm("Bạn có chắc muốn hủy job này?")) return;
        cancelJob(job.identifier)
          .then(function () {
            onCancelSuccess();
          })
          .catch(function (err) {
            alert(err.message || "Không thể hủy job.");
          });
      });
    }
  }

  function showError(message) {
    modals.errorModalMessage.textContent = message || "Không có thông tin lỗi.";
    modals.errorModal.showModal();
  }

  function openDownloadModal(job) {
    downloadJob = job;
    modals.downloadModalJobName.textContent = truncateFileName(job.file_name, 48);
    modals.downloadModalJobName.title = job.file_name || "";
    renderDownloadFileList(job);
    modals.downloadModal.showModal();
  }

  function updatePagination(els, data, onPageChange) {
    var items = data.items || [];
    var total = data.total || 0;
    var page = data.page || 1;
    var limit = data.limit || 5;
    var totalPages = data.total_pages || Math.max(1, Math.ceil(total / limit));

    if (items.length === 0) {
      els.pagination.hidden = true;
      return;
    }

    if (totalPages > 1 || total > limit) {
      els.pagination.hidden = false;
      var start = (page - 1) * limit + 1;
      var end = Math.min(page * limit, total);
      els.range.textContent = "Hiển thị " + start + "–" + end + " / " + total + " jobs";
      els.pageInfo.textContent = "Trang " + page + " / " + totalPages;
      els.pagePrev.disabled = page <= 1;
      els.pageNext.disabled = page >= totalPages;
      if (onPageChange) onPageChange(page);
    } else {
      els.pagination.hidden = total === 0;
      if (total > 0) {
        els.range.textContent = "Hiển thị " + total + " / " + total + " jobs";
        els.pageInfo.textContent = "Trang 1 / 1";
        els.pagePrev.disabled = true;
        els.pageNext.disabled = true;
        els.pagination.hidden = false;
      }
      if (onPageChange) onPageChange(page);
    }
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
      /* QuotaExceededError */
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

    modals.downloadFileList.innerHTML = "";

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

      modals.downloadFileList.appendChild(li);
    });

    updateSelectAllCheckbox(job);
  }

  function updateSelectAllCheckbox(job) {
    var files = getOutputFiles(job);
    var selected = getSelectedForJob(job.identifier);
    modals.downloadSelectAll.checked = files.length > 0 && files.every(function (f) {
      return selected.has(f.id);
    });
    modals.downloadSelectAll.indeterminate =
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

  var ONE_DAY_MS = 86400000;

  function formatDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    var pad = function (n) { return n < 10 ? "0" + n : String(n); };
    return (
      pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes())+ ":" + pad(d.getSeconds())
    );
  }

  function formatRelativeTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";

    var absolute = formatDateTime(iso);
    var diffMs = Date.now() - d.getTime();
    if (diffMs < 0 || diffMs > ONE_DAY_MS) return absolute;

    var diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Vừa xong";
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + " phút trước";
    return Math.floor(diffMin / 60) + " giờ trước";
  }

  function dateTimeCellHtml(iso) {
    if (!iso) return "—";

    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";

    var absolute = formatDateTime(iso);
    var diffMs = Date.now() - d.getTime();
    if (diffMs < 0 || diffMs > ONE_DAY_MS) {
      return escapeHtml(absolute);
    }

    var relative = formatRelativeTime(iso);
    return (
      '<span title="' + escapeHtml(absolute) + '">' + escapeHtml(relative) + "</span>"
    );
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

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.JobUI = {
    init: init,
    fetchJobs: fetchJobs,
    cancelJob: cancelJob,
    actionButtonsHtml: actionButtonsHtml,
    bindRowActions: bindRowActions,
    showError: showError,
    openDownloadModal: openDownloadModal,
    badgeHtml: badgeHtml,
    formatDateTime: formatDateTime,
    formatRelativeTime: formatRelativeTime,
    dateTimeCellHtml: dateTimeCellHtml,
    truncateFileName: truncateFileName,
    escapeHtml: escapeHtml,
    formatFileSize: formatFileSize,
    getOutputFiles: getOutputFiles,
    updatePagination: updatePagination,
  };
})();
