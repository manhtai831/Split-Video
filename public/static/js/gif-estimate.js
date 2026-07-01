(function () {
  "use strict";

  var FORM_STORAGE_KEY = "gifForm.options";

  var PERSISTED_FIELD_IDS = [
    "output_fmt",
    "sizePreset",
    "width",
    "height",
    "quality_preset",
    "max_colors",
    "dither",
    "webp_quality",
    "fps",
    "startAt",
    "duration",
  ];

  var QUALITY_BYTES_PER_PIXEL = {
    gif: { low: 0.8, medium: 1.2, high: 2.0, max: 2.5, custom: 1.5 },
    webp: { low: 0.3, medium: 0.5, high: 0.8, max: 1.2, custom: 0.6 },
    apng: { low: 1.0, medium: 1.5, high: 2.2, max: 3.0, custom: 1.8 },
  };

  function $(id) {
    return document.getElementById(id);
  }

  function readFormStateFromStorage() {
    try {
      var raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* ignore corrupt storage */
    }
    return null;
  }

  function writeFormStateToStorage(state) {
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  function collectFormState() {
    var state = {};
    PERSISTED_FIELD_IDS.forEach(function (id) {
      var el = $(id);
      if (el) state[id] = el.value;
    });

    var dimMode = document.querySelector('input[name="dimension_mode"]:checked');
    state.dimension_mode = dimMode ? dimMode.value : "aspect_lock";

    var loopEl = $("loop");
    state.loop = loopEl ? loopEl.checked : true;

    var losslessEl = $("lossless");
    state.lossless = losslessEl ? losslessEl.checked : false;

    if (typeof window.getGifSegments === "function") {
      var segs = window.getGifSegments();
      if (segs && segs.length > 0) {
        state.segments = segs.map(function (s) {
          return { start_at: s.start_at, duration: s.duration };
        });
      }
    }

    return state;
  }

  function applyFieldValue(el, value) {
    if (!el || value === undefined || value === null) return;
    if (el.tagName === "SELECT") {
      if (el.querySelector('option[value="' + value + '"]')) {
        el.value = value;
      }
      return;
    }
    el.value = value;
  }

  function applySavedFormState() {
    var saved = readFormStateFromStorage();
    if (!saved) return false;

    if (saved.dimension_mode === "aspect_lock" || saved.dimension_mode === "manual") {
      var radio = document.querySelector(
        'input[name="dimension_mode"][value="' + saved.dimension_mode + '"]'
      );
      if (radio) radio.checked = true;
    }

    PERSISTED_FIELD_IDS.forEach(function (id) {
      applyFieldValue($(id), saved[id]);
    });

    var loopEl = $("loop");
    if (loopEl && typeof saved.loop === "boolean") {
      loopEl.checked = saved.loop;
    }

    var losslessEl = $("lossless");
    if (losslessEl && typeof saved.lossless === "boolean") {
      losslessEl.checked = saved.lossless;
    }

    return true;
  }

  function persistFormState() {
    writeFormStateToStorage(collectFormState());
  }

  function formatFileSize(bytes) {
    if (window.JobUI && typeof window.JobUI.formatFileSize === "function") {
      return window.JobUI.formatFileSize(bytes);
    }
    if (!bytes || bytes < 1) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function getSegments() {
    if (typeof window.getGifSegments === "function") {
      var segs = window.getGifSegments();
      if (segs && segs.length > 0) return segs;
    }
    var startInput = $("startAt");
    var durationInput = $("duration");
    var start = parseFloat(startInput ? startInput.value : "0") || 0;
    var dur = parseFloat(durationInput ? durationInput.value : "5") || 5;
    return [{ start_at: start, duration: dur }];
  }

  function estimateSegmentBytes(fmt, preset, width, height, fps, duration) {
    var table = QUALITY_BYTES_PER_PIXEL[fmt] || QUALITY_BYTES_PER_PIXEL.gif;
    var factor = table[preset] || table.high;
    var frames = Math.max(1, Math.round(fps * duration));
    return Math.round(width * height * frames * factor * 0.01);
  }

  function updateEstimate() {
    var box = $("gifEstimateBox");
    var sizeEl = $("gifEstimateSize");
    if (!box || !sizeEl) return;

    var fmt = $("output_fmt") ? $("output_fmt").value : "gif";
    var preset = $("quality_preset") ? $("quality_preset").value : "high";
    var width = parseInt($("width") ? $("width").value : "0", 10) || 0;
    var height = parseInt($("height") ? $("height").value : "0", 10) || 0;
    var fps = parseInt($("fps") ? $("fps").value : "10", 10) || 10;

    if (!width || !height) {
      box.hidden = true;
      return;
    }

    var segments = getSegments();
    var total = 0;
    segments.forEach(function (seg) {
      total += estimateSegmentBytes(fmt, preset, width, height, fps, seg.duration);
    });

    box.hidden = false;
    sizeEl.textContent = formatFileSize(total);
    if (segments.length > 1) {
      sizeEl.textContent += " (" + segments.length + " đoạn)";
    }
  }

  function bindEvents() {
    PERSISTED_FIELD_IDS.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        persistFormState();
        updateEstimate();
      });
      if (el.type === "number") {
        el.addEventListener("input", function () {
          persistFormState();
          updateEstimate();
        });
      }
    });

    document.querySelectorAll('input[name="dimension_mode"]').forEach(function (el) {
      el.addEventListener("change", function () {
        persistFormState();
        updateEstimate();
      });
    });

    ["loop", "lossless"].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.addEventListener("change", function () {
          persistFormState();
          updateEstimate();
        });
      }
    });

    var prevOnDimensionsChanged = window.onGifDimensionsChanged;
    window.onGifDimensionsChanged = function () {
      persistFormState();
      updateEstimate();
      if (typeof prevOnDimensionsChanged === "function") {
        prevOnDimensionsChanged();
      }
    };

    var prevOnTimelineChanged = window.onGifTimelineChanged;
    window.onGifTimelineChanged = function () {
      persistFormState();
      updateEstimate();
      if (typeof prevOnTimelineChanged === "function") {
        prevOnTimelineChanged();
      }
    };

    var prevOnSegmentsChanged = window.onGifSegmentsChanged;
    window.onGifSegmentsChanged = function () {
      persistFormState();
      updateEstimate();
      if (typeof prevOnSegmentsChanged === "function") {
        prevOnSegmentsChanged();
      }
    };
  }

  function initGifEstimate() {
    bindEvents();

    var hadSaved = applySavedFormState();
    if (hadSaved) {
      window.__gifSkipEditorReset = true;
      if (typeof window.restoreGifSegments === "function") {
        window.restoreGifSegments(readFormStateFromStorage());
      }
    }

    if (typeof window.syncGifFileInput === "function") {
      window.syncGifFileInput();
    }

    updateEstimate();
  }

  window.initGifEstimate = initGifEstimate;
  window.persistGifFormState = persistFormState;
  window.readGifFormStateFromStorage = readFormStateFromStorage;
})();
