(function () {
  "use strict";

  var objectUrl = null;
  var videoMeta = { duration: 0, width: 0, height: 0 };

  function $(id) {
    return document.getElementById(id);
  }

  function makeEven(n) {
    n = Math.round(n);
    return n % 2 === 0 ? n : n + 1;
  }

  function getDimensionMode() {
    var checked = document.querySelector('input[name="dimension_mode"]:checked');
    return checked ? checked.value : "aspect_lock";
  }

  function probeVideoMeta(url) {
    return new Promise(function (resolve) {
      var video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      function cleanup() {
        video.removeAttribute("src");
        video.load();
      }

      video.onloadedmetadata = function () {
        var meta = {
          duration: video.duration || 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        };
        cleanup();
        resolve(meta);
      };
      video.onerror = function () {
        cleanup();
        resolve({ duration: 0, width: 0, height: 0 });
      };
      video.src = url;
    });
  }

  function formatDuration(seconds) {
    if (!seconds || !isFinite(seconds)) return "—";
    var total = Math.round(seconds);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function applyDimensions(width, height) {
    var wInput = $("width");
    var hInput = $("height");
    if (wInput) wInput.value = makeEven(width);
    if (hInput) hInput.value = makeEven(height);
    updateAspectWarning();
    if (typeof window.onGifDimensionsChanged === "function") {
      window.onGifDimensionsChanged();
    }
  }

  function calcHeightFromWidth(w) {
    if (!videoMeta.width || !videoMeta.height) return w;
    return makeEven((w * videoMeta.height) / videoMeta.width);
  }

  function calcWidthFromHeight(h) {
    if (!videoMeta.width || !videoMeta.height) return h;
    return makeEven((h * videoMeta.width) / videoMeta.height);
  }

  function updateAspectWarning() {
    var warn = $("gifAspectWarning");
    if (!warn) return;
    if (getDimensionMode() !== "manual") {
      warn.hidden = true;
      return;
    }
    var w = parseInt($("width").value, 10) || 0;
    var h = parseInt($("height").value, 10) || 0;
    if (!videoMeta.width || !videoMeta.height || !w || !h) {
      warn.hidden = true;
      return;
    }
    var srcRatio = videoMeta.width / videoMeta.height;
    var dstRatio = w / h;
    warn.hidden = Math.abs(srcRatio - dstRatio) <= 0.02;
  }

  function applySizePreset(preset) {
    if (!videoMeta.width) return;
    if (preset === "original") {
      applyDimensions(videoMeta.width, videoMeta.height);
      return;
    }
    if (preset === "custom") return;
    var targetW = parseInt(preset, 10);
    if (!targetW) return;
    var h = calcHeightFromWidth(targetW);
    applyDimensions(targetW, h);
  }

  function revokeUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function onFileChange() {
    var fileInput = $("file");
    var editor = $("gifEditor");
    var metaEl = $("gifFileMeta");
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      revokeUrl();
      videoMeta = { duration: 0, width: 0, height: 0 };
      if (editor) editor.hidden = true;
      if (metaEl) metaEl.hidden = true;
      return;
    }

    var file = fileInput.files[0];
    var restoring = !!window.__gifSkipEditorReset;
    revokeUrl();
    objectUrl = URL.createObjectURL(file);

    var player = $("gifPreviewPlayer");
    if (player) {
      player.src = objectUrl;
    }

    probeVideoMeta(objectUrl).then(function (meta) {
      videoMeta = meta;
      if (editor) editor.hidden = false;
      if (metaEl) {
        metaEl.hidden = false;
        metaEl.textContent =
          formatDuration(meta.duration) +
          " · " +
          meta.width +
          "×" +
          meta.height;
      }

      if (restoring) {
        window.__gifSkipEditorReset = false;
        updateAspectWarning();
        toggleQualityPanels();
        if (typeof window.onGifVideoLoaded === "function") {
          window.onGifVideoLoaded(meta, player, { restore: true });
        }
        if (typeof window.onGifDimensionsChanged === "function") {
          window.onGifDimensionsChanged();
        }
        return;
      }

      applyDimensions(meta.width, meta.height);

      var preset = $("sizePreset");
      if (preset) preset.value = "original";

      var fpsSelect = $("fps");
      if (fpsSelect && meta.duration > 0) {
        fpsSelect.value = "10";
      }

      if (typeof window.onGifVideoLoaded === "function") {
        window.onGifVideoLoaded(meta, player);
      }
      if (typeof window.onGifDimensionsChanged === "function") {
        window.onGifDimensionsChanged();
      }
    });
  }

  function syncFromFileInput() {
    var fileInput = $("file");
    if (!fileInput) return;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function bindEvents() {
    var fileInput = $("file");
    if (fileInput) {
      fileInput.addEventListener("change", onFileChange);
    }

    var widthInput = $("width");
    var heightInput = $("height");
    if (widthInput) {
      widthInput.addEventListener("input", function () {
        if (getDimensionMode() === "aspect_lock") {
          var w = parseInt(widthInput.value, 10) || 0;
          $("height").value = calcHeightFromWidth(w);
        }
        var preset = $("sizePreset");
        if (preset) preset.value = "custom";
        updateAspectWarning();
        if (typeof window.onGifDimensionsChanged === "function") {
          window.onGifDimensionsChanged();
        }
      });
    }
    if (heightInput) {
      heightInput.addEventListener("input", function () {
        if (getDimensionMode() === "aspect_lock") {
          var h = parseInt(heightInput.value, 10) || 0;
          $("width").value = calcWidthFromHeight(h);
        }
        var preset = $("sizePreset");
        if (preset) preset.value = "custom";
        updateAspectWarning();
        if (typeof window.onGifDimensionsChanged === "function") {
          window.onGifDimensionsChanged();
        }
      });
    }

    document.querySelectorAll('input[name="dimension_mode"]').forEach(function (el) {
      el.addEventListener("change", function () {
        if (getDimensionMode() === "aspect_lock" && videoMeta.width) {
          var w = parseInt($("width").value, 10) || videoMeta.width;
          applyDimensions(w, calcHeightFromWidth(w));
        }
        updateAspectWarning();
      });
    });

    var presetSelect = $("sizePreset");
    if (presetSelect) {
      presetSelect.addEventListener("change", function () {
        applySizePreset(presetSelect.value);
      });
    }

    var outputFmt = $("output_fmt");
    var qualityPreset = $("quality_preset");
    if (outputFmt) outputFmt.addEventListener("change", toggleQualityPanels);
    if (qualityPreset) qualityPreset.addEventListener("change", toggleQualityPanels);
    toggleQualityPanels();
  }

  function toggleQualityPanels() {
    var preset = $("quality_preset");
    var customPanel = $("gifCustomQuality");
    var paletteOpts = $("gifPaletteOptions");
    var webpOpts = $("gifWebpOptions");
    var fmt = $("output_fmt") ? $("output_fmt").value : "gif";

    if (customPanel) {
      customPanel.hidden = !preset || preset.value !== "custom";
    }
    if (paletteOpts) paletteOpts.hidden = fmt === "webp";
    if (webpOpts) webpOpts.hidden = fmt !== "webp";

    if (typeof window.onGifDimensionsChanged === "function") {
      window.onGifDimensionsChanged();
    }
  }

  function initGifFilePreview() {
    bindEvents();
    window.getGifVideoMeta = function () {
      return videoMeta;
    };
    window.syncGifFileInput = syncFromFileInput;

    window.addEventListener("beforeunload", revokeUrl);

    window.addEventListener("pageshow", function (e) {
      if (e.persisted) {
        window.__gifSkipEditorReset = true;
        syncFromFileInput();
      }
    });
  }

  window.initGifFilePreview = initGifFilePreview;
})();
