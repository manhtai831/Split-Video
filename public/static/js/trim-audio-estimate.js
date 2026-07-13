(function () {
  "use strict";

  var FORM_STORAGE_KEY = "trimAudioForm.options";

  // end is set from audio duration on file select — not restored from storage
  var PERSISTED_FIELD_IDS = ["start", "fade_in", "fade_out"];

  var fileDurations = [];
  var probeGeneration = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function readFormStateFromStorage() {
    try {
      var raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function writeFormStateToStorage(state) {
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore */
    }
  }

  function collectFormState() {
    var state = {};
    PERSISTED_FIELD_IDS.forEach(function (id) {
      var el = $(id);
      if (el) state[id] = el.value;
    });
    return state;
  }

  function applySavedFormState() {
    var saved = readFormStateFromStorage();
    if (!saved) return;

    if (saved.fade !== undefined && saved.fade_in === undefined && saved.fade_out === undefined) {
      saved.fade_in = saved.fade;
      saved.fade_out = saved.fade;
    }

    PERSISTED_FIELD_IDS.forEach(function (id) {
      var el = $(id);
      var value = saved[id];
      if (!el || value === undefined || value === null) return;
      var num = parseFloat(value);
      el.value = isFinite(num) ? formatSecondsValue(num) : value;
    });
  }

  function persistFormState() {
    writeFormStateToStorage(collectFormState());
  }

  function clearPersistedFormState() {
    try {
      localStorage.removeItem(FORM_STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function resetTrimAudioForm() {
    clearPersistedFormState();
    var start = $("start");
    var end = $("end");
    var fadeIn = $("fade_in");
    var fadeOut = $("fade_out");
    if (start) start.value = "0";
    if (end) {
      end.value = "";
      end.removeAttribute("max");
    }
    if (fadeIn) fadeIn.value = "0";
    if (fadeOut) fadeOut.value = "0";
    fileDurations = [];
    updateEstimate();
    if (typeof window.stopTrimAudioPreview === "function") {
      window.stopTrimAudioPreview();
    }
    if (typeof window.clearTrimAudioFile === "function") {
      window.clearTrimAudioFile();
    } else {
      setConfigVisible(false);
      if (typeof window.syncTrimAudioSegmentMeta === "function") {
        window.syncTrimAudioSegmentMeta();
      }
    }
  }

  function formatSecondsValue(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "0";
    var rounded = Math.round(seconds * 10) / 10;
    var s = String(rounded);
    if (s.indexOf(".") >= 0) {
      s = s.replace(/\.?0+$/, "");
    }
    return s || "0";
  }

  function normalizeSecondsInput(el) {
    if (!el) return;
    var raw = parseFloat(el.value);
    if (!isFinite(raw)) return;
    el.value = formatSecondsValue(raw);
  }

  function applyDefaultEnd(duration) {
    var endEl = $("end");
    if (!endEl || !(duration > 0)) return;
    endEl.value = formatSecondsValue(duration);
    endEl.max = formatSecondsValue(duration);
    var startEl = $("start");
    if (startEl) {
      var start = parseFloat(startEl.value);
      if (isFinite(start) && start >= duration) {
        startEl.value = "0";
      }
    }
    if (typeof window.syncTrimAudioSegmentMeta === "function") {
      window.syncTrimAudioSegmentMeta();
    }
  }

  function formatTime(totalSeconds) {
    if (totalSeconds < 60) return "< 1 phút";
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = Math.round(totalSeconds % 60);
    if (seconds === 0) return "~" + minutes + " phút";
    return "~" + minutes + " phút " + seconds + " giây";
  }

  function formatDuration(seconds) {
    if (!seconds || !isFinite(seconds)) return "—";
    var total = Math.round(seconds);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function getTrimParams() {
    var start = parseFloat($("start") ? $("start").value : "0");
    var end = parseFloat($("end") ? $("end").value : "");
    var fadeIn = parseFloat($("fade_in") ? $("fade_in").value : "0");
    var fadeOut = parseFloat($("fade_out") ? $("fade_out").value : "0");
    if (!isFinite(start)) start = 0;
    if (!isFinite(fadeIn) || fadeIn < 0) fadeIn = 0;
    if (!isFinite(fadeOut) || fadeOut < 0) fadeOut = 0;
    return { start: start, end: end, fadeIn: fadeIn, fadeOut: fadeOut };
  }

  function segmentDurationForFile(fileDuration) {
    var p = getTrimParams();
    if (!isFinite(p.end) || p.end <= p.start) return 0;
    var end = Math.min(p.end, fileDuration || p.end);
    var start = Math.max(0, Math.min(p.start, end));
    return Math.max(0, end - start);
  }

  function estimateSecondsForSegment(segDur) {
    if (!segDur) return 0;
    var p = getTrimParams();
    var factor = p.fadeIn > 0 || p.fadeOut > 0 ? 0.45 : 0.15;
    return Math.max(segDur * factor, 2);
  }

  function setConfigVisible(visible) {
    if (typeof window.setTrimAudioConfigVisible === "function") {
      window.setTrimAudioConfigVisible(visible);
      return;
    }
    var config = $("trimAudioConfig");
    if (config) config.hidden = !visible;
  }

  function updateEstimate() {
    var estimateBox = $("estimateBox");
    var estimateTime = $("estimateTime");
    var estimateDuration = $("estimateDuration");
    if (!estimateBox || !estimateTime) return;

    var duration = fileDurations[0] || 0;
    if (!(duration > 0)) {
      estimateBox.hidden = true;
      return;
    }

    var seg = segmentDurationForFile(duration);
    var totalSeconds = estimateSecondsForSegment(seg || duration);
    estimateTime.textContent = formatTime(totalSeconds);

    if (estimateDuration) {
      var p = getTrimParams();
      if (isFinite(p.end) && p.end > p.start && seg > 0) {
        estimateDuration.hidden = false;
        estimateDuration.textContent = "Độ dài đoạn cắt: " + formatDuration(seg);
      } else {
        estimateDuration.hidden = true;
      }
    }

    estimateBox.hidden = false;
  }

  function probeDuration(url) {
    return new Promise(function (resolve) {
      var audio = document.createElement("audio");
      audio.preload = "metadata";

      function cleanup() {
        audio.removeAttribute("src");
        audio.load();
      }

      audio.onloadedmetadata = function () {
        resolve(audio.duration || 0);
        cleanup();
      };
      audio.onerror = function () {
        cleanup();
        resolve(0);
      };
      audio.src = url;
    });
  }

  async function probeFiles(files) {
    var gen = ++probeGeneration;
    if (!files || !files.length) {
      fileDurations = [];
      updateEstimate();
      return;
    }

    var file = files[0];
    var url = URL.createObjectURL(file);
    var duration = 0;
    try {
      duration = await probeDuration(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    if (gen !== probeGeneration) return;
    fileDurations = [duration];
    applyDefaultEnd(duration);
    updateEstimate();
  }

  function bindFormEvents() {
    var fileInput = $("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var hasFiles = !!(fileInput.files && fileInput.files.length);
        setConfigVisible(hasFiles);
        probeFiles(fileInput.files);
      });
    }

    window.onTrimAudioFilesChanged = function (durations) {
      fileDurations = durations || [];
      setConfigVisible(fileDurations.length > 0);
      if (fileDurations[0] > 0) {
        applyDefaultEnd(fileDurations[0]);
      }
      updateEstimate();
    };

    ["start", "end", "fade_in", "fade_out"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        normalizeSecondsInput(el);
        if (id !== "end") persistFormState();
        updateEstimate();
      });
      el.addEventListener("input", function () {
        if (id !== "end") persistFormState();
        updateEstimate();
      });
    });

    applySavedFormState();
    updateEstimate();

    if (fileInput && fileInput.files && fileInput.files.length) {
      setConfigVisible(true);
      probeFiles(fileInput.files);
    } else {
      setConfigVisible(false);
    }
  }

  window.clearTrimAudioPersistedOptions = clearPersistedFormState;
  window.resetTrimAudioForm = resetTrimAudioForm;
  window.initTrimAudioEstimate = bindFormEvents;
})();
