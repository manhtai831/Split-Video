(function () {
  "use strict";

  var hooks = {
    onSelect: null,
    onFilter: null,
    onPlay: null,
    onDownload: null,
    onOpenLink: null,
  };

  var lastFormats = [];

  var ICON_PLAY =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polygon points="6 3 20 12 6 21 6 3"/>' +
    "</svg>";

  var ICON_DOWNLOAD =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" y1="15" x2="12" y2="3"/>' +
    "</svg>";

  var ICON_OPEN =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
    '<polyline points="15 3 21 3 21 9"/>' +
    '<line x1="10" y1="14" x2="21" y2="3"/>' +
    "</svg>";

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSize(bytes) {
    if (!bytes || bytes < 1) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  }

  function formatBitrate(kbps) {
    if (!kbps || kbps < 1) return "—";
    if (kbps >= 100) return Math.round(kbps) + " kbps";
    return kbps.toFixed(1) + " kbps";
  }

  function formatQuality(f) {
    if (f.kind === "audio") return formatBitrate(f.abr);
    return f.resolution || "—";
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) {
      return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }
    return m + ":" + String(s).padStart(2, "0");
  }

  function youtubeWatchUrl(item) {
    if (!item) return "";
    if (item.webpage_url) return item.webpage_url;
    if (item.youtube_id) return "https://www.youtube.com/watch?v=" + item.youtube_id;
    return "";
  }

  function setPreview(item) {
    var preview = $("ytFormatPreview");
    var thumb = $("ytFormatPreviewThumb");
    var title = $("ytFormatPreviewTitle");
    var sub = $("ytFormatPreviewSub");
    if (!preview) return;
    if (!item) {
      preview.hidden = true;
      preview.removeAttribute("data-url");
      preview.disabled = true;
      if (thumb) {
        thumb.removeAttribute("src");
        thumb.hidden = true;
      }
      if (title) title.textContent = "—";
      if (sub) sub.textContent = "—";
      return;
    }
    var url = youtubeWatchUrl(item);
    preview.hidden = false;
    preview.disabled = !url;
    if (url) preview.setAttribute("data-url", url);
    else preview.removeAttribute("data-url");
    if (title) title.textContent = item.title || item.youtube_id || "—";
    if (sub) {
      sub.textContent =
        (item.channel || "—") + (item.duration ? " · " + formatDuration(item.duration) : "");
    }
    if (thumb) {
      if (item.thumbnail) {
        thumb.src = item.thumbnail;
        thumb.hidden = false;
      } else {
        thumb.removeAttribute("src");
        thumb.hidden = true;
      }
    }
  }

  function setStatus(text, isError) {
    var el = $("ytFormatsStatus");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("yt-status--error", !!isError);
  }

  function reset() {
    lastFormats = [];
    setStatus("", false);
    setPreview(null);
    var hint = $("ytFormatsHint");
    var filters = $("ytFormatFilters");
    var wrap = $("ytFormatsWrap");
    var body = $("ytFormatsBody");
    if (hint) hint.hidden = false;
    if (filters) filters.hidden = true;
    if (wrap) wrap.hidden = true;
    if (body) body.innerHTML = "";
  }

  function setLoading(loading) {
    var hint = $("ytFormatsHint");
    if (hint) hint.hidden = true;
    setStatus(loading ? "Đang tải formats…" : "", false);
  }

  function setError(msg) {
    setStatus(msg || "Lỗi", true);
    var wrap = $("ytFormatsWrap");
    if (wrap) wrap.hidden = true;
  }

  function iconButtonHtml(action, label, icon, disabled) {
    return (
      '<button type="button" class="btn btn--icon btn--ghost btn--sm yt-format-action" data-action="' +
      escapeHtml(action) +
      '" title="' +
      escapeHtml(label) +
      '" aria-label="' +
      escapeHtml(label) +
      '"' +
      (disabled ? " disabled" : "") +
      ">" +
      icon +
      "</button>"
    );
  }

  function actionButtonsHtml(f) {
    var canPlay = true;
    var parts = [];
    if (canPlay) {
      parts.push(iconButtonHtml("play", "Phát", ICON_PLAY, false));
    }
    parts.push(iconButtonHtml("download", "Tải xuống", ICON_DOWNLOAD, false));
    // parts.push(iconButtonHtml("open", "Mở link", ICON_OPEN, false));
    return parts.join("");
  }

  function render(formats, selectedId, filter) {
    filter = filter || "all";
    lastFormats = formats || [];
    var hint = $("ytFormatsHint");
    var filters = $("ytFormatFilters");
    var wrap = $("ytFormatsWrap");
    var body = $("ytFormatsBody");
    if (!body) return;

    setStatus("", false);
    if (hint) hint.hidden = true;
    if (filters) {
      filters.hidden = false;
      Array.prototype.forEach.call(filters.querySelectorAll(".yt-filter-btn"), function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-filter") === filter);
      });
    }

    var filtered = lastFormats.filter(function (f) {
      if (filter === "all") return true;
      return f.kind === filter;
    });

    if (!filtered.length) {
      body.innerHTML = "";
      if (wrap) wrap.hidden = true;
      setStatus("Không có format phù hợp bộ lọc.", false);
      return;
    }

    if (wrap) wrap.hidden = false;
    body.innerHTML = filtered
      .map(function (f) {
        var checked = f.format_id === selectedId;
        return (
          '<tr class="yt-formats-table__row' +
          (checked ? " is-selected" : "") +
          '" data-format-id="' +
          escapeHtml(f.format_id) +
          '" data-kind="' +
          escapeHtml(f.kind || "") +
          '" tabindex="0">' +
          "<td>" +
          escapeHtml(formatQuality(f)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatSize(f.filesize)) +
          "</td>" +
          "<td>" +
          escapeHtml(f.format_note || f.kind || "") +
          "</td>" +
          '<td class="cell-actions"><div class="cell-actions__inner">' +
          actionButtonsHtml(f) +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function setSelected(formatId) {
    var body = $("ytFormatsBody");
    if (!body) return;
    Array.prototype.forEach.call(body.querySelectorAll("tr[data-format-id]"), function (tr) {
      tr.classList.toggle("is-selected", tr.getAttribute("data-format-id") === formatId);
    });
  }

  function selectFromRow(tr) {
    if (!tr) return;
    var formatId = tr.getAttribute("data-format-id");
    if (!formatId) return;
    setSelected(formatId);
    if (hooks.onSelect) hooks.onSelect(formatId);
  }

  function handleRowAction(btn, tr) {
    var formatId = tr.getAttribute("data-format-id");
    if (!formatId) return;
    selectFromRow(tr);
    var action = btn.getAttribute("data-action");
    if (action === "play" && hooks.onPlay) hooks.onPlay(formatId);
    else if (action === "download" && hooks.onDownload) hooks.onDownload(formatId);
    else if (action === "open" && hooks.onOpenLink) hooks.onOpenLink(formatId);
  }

  function init(options) {
    hooks.onSelect = options && options.onSelect;
    hooks.onFilter = options && options.onFilter;
    hooks.onPlay = options && options.onPlay;
    hooks.onDownload = options && options.onDownload;
    hooks.onOpenLink = options && options.onOpenLink;

    var wrap = $("ytFormatsWrap");
    if (wrap) {
      wrap.addEventListener("click", function (e) {
        var actionBtn = e.target.closest(".yt-format-action");
        var tr = e.target.closest("tr[data-format-id]");
        if (!tr || !wrap.contains(tr)) return;
        if (actionBtn) {
          e.preventDefault();
          e.stopPropagation();
          if (actionBtn.disabled) return;
          handleRowAction(actionBtn, tr);
          return;
        }
        selectFromRow(tr);
      });

      wrap.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.target.closest(".yt-format-action")) return;
        var tr = e.target.closest("tr[data-format-id]");
        if (!tr || !wrap.contains(tr)) return;
        e.preventDefault();
        selectFromRow(tr);
      });
    }

    var filters = $("ytFormatFilters");
    if (filters) {
      filters.addEventListener("click", function (e) {
        var btn = e.target.closest(".yt-filter-btn");
        if (!btn) return;
        var filter = btn.getAttribute("data-filter") || "all";
        if (hooks.onFilter) hooks.onFilter(filter);
      });
    }

    var preview = $("ytFormatPreview");
    if (preview) {
      preview.addEventListener("click", function () {
        var url = preview.getAttribute("data-url");
        if (!url) return;
        window.open(url, "_blank", "noopener,noreferrer");
      });
    }

    reset();
  }

  window.YoutubeDownloadFormats = {
    init: init,
    render: render,
    reset: reset,
    setLoading: setLoading,
    setError: setError,
    setSelected: setSelected,
    setPreview: setPreview,
  };
})();
