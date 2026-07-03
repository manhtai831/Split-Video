(function () {
  "use strict";

  var overlayEl = null;
  var isOpen = false;
  var onCloseCallback = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setPageLocked(locked) {
    document.body.classList.toggle("editor-active", locked);
  }

  function showOverlay() {
    if (!overlayEl) return;
    overlayEl.hidden = false;
    isOpen = true;
    setPageLocked(true);
  }

  function hideOverlay() {
    if (!overlayEl) return;
    overlayEl.hidden = true;
    isOpen = false;
    setPageLocked(false);
    if (window.EditorTimeline && window.EditorTimeline.pause) {
      window.EditorTimeline.pause();
    }
    if (typeof onCloseCallback === "function") {
      onCloseCallback();
    }
  }

  function replaceJobQuery(identifier) {
    var url = new URL(window.location.href);
    if (identifier) {
      if (url.searchParams.get("job") === identifier) return;
      url.searchParams.set("job", identifier);
    } else {
      if (!url.searchParams.has("job")) return;
      url.searchParams.delete("job");
    }
    var next = url.pathname + (url.search ? url.search : "");
    window.history.replaceState({}, "", next);
  }

  function openEditor(identifier) {
    if (!window.EditorApp) return Promise.resolve();

    var chain = Promise.resolve();
    if (identifier && window.EditorAPI) {
      replaceJobQuery(identifier);
      chain = window.EditorAPI.getJob(identifier).then(function (job) {
        window.EditorApp.loadFromServer(job);
      });
    } else {
      replaceJobQuery(null);
      window.EditorApp.resetProject();
    }

    return chain
      .then(function () {
        showOverlay();
        if (window.EditorApp.onFrameResize) {
          window.EditorApp.onFrameResize();
        }
      })
      .catch(function (err) {
        if (identifier) replaceJobQuery(null);
        if (window.EditorApp.showToast) {
          window.EditorApp.showToast(err.message || "Không thể mở project");
        }
      });
  }

  function closeEditor(force) {
    if (!isOpen) return;
    if (
      !force &&
      window.EditorApp &&
      window.EditorApp.isDirty &&
      window.EditorApp.isDirty() &&
      !window.confirm("Bạn có thay đổi chưa lưu. Đóng editor?")
    ) {
      return;
    }
    hideOverlay();
    replaceJobQuery(null);
  }

  function init(opts) {
    overlayEl = $("editorOverlayRoot");
    onCloseCallback = opts && opts.onClose ? opts.onClose : null;

    var closeBtn = $("editorClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        closeEditor(false);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (!isOpen || e.key !== "Escape") return;
      if (e.target && e.target.closest && e.target.closest("dialog[open]")) return;
      e.preventDefault();
      closeEditor(false);
    });

    var params = new URLSearchParams(window.location.search);
    var jobId = params.get("job");
    if (jobId) {
      openEditor(jobId);
    }
  }

  window.EditorShell = {
    init: init,
    open: openEditor,
    close: closeEditor,
    syncJobQuery: function (identifier) {
      if (isOpen) replaceJobQuery(identifier || null);
    },
    isOpen: function () {
      return isOpen;
    },
  };
})();
