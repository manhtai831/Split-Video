(function () {
  "use strict";

  var FORM_STORAGE_KEY = "mergeAudioForm.options";
  var PERSISTED_FIELD_IDS = ["output_format", "audio_bitrate"];
  var ALLOWED_FORMATS = { mp3: true, m4a: true, wav: true, flac: true, ogg: true };

  var fileDurations = [];
  var probeGeneration = 0;
  var userTouchedFormat = false;
  var lastSuggestedFormat = "";

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

    PERSISTED_FIELD_IDS.forEach(function (id) {
      var el = $(id);
      var value = saved[id];
      if (!el || value === undefined || value === null) return;
      if (el.tagName === "SELECT") {
        if (el.querySelector('option[value="' + value + '"]')) {
          el.value = value;
        }
        return;
      }
      el.value = value;
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

  function resetMergeAudioForm() {
    clearPersistedFormState();
    userTouchedFormat = false;
    lastSuggestedFormat = "";
    var formatEl = $("output_format");
    var bitrateEl = $("audio_bitrate");
    if (formatEl) formatEl.value = "mp3";
    if (bitrateEl) bitrateEl.value = "original";
    fileDurations = [];
    updateBitrateVisibility();
    updateEstimate();
    if (typeof window.stopMergeAudioPreview === "function") {
      window.stopMergeAudioPreview();
    }
    if (typeof window.clearMergeAudioFiles === "function") {
      window.clearMergeAudioFiles();
    } else {
      setConfigVisible(false);
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

  function fileExt(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function normalizeExt(ext) {
    if (ext === "aac" || ext === "mp4") return "m4a";
    if (ext === "oga") return "ogg";
    return ext;
  }

  function mostCommonAudioExt(files) {
    if (!files || !files.length) return "mp3";
    var counts = {};
    var order = [];
    for (var i = 0; i < files.length; i++) {
      var ext = normalizeExt(fileExt(files[i].name));
      if (!ALLOWED_FORMATS[ext]) continue;
      if (!counts[ext]) {
        counts[ext] = 0;
        order.push(ext);
      }
      counts[ext]++;
    }
    if (!order.length) return "mp3";
    var best = order[0];
    var bestCount = counts[best];
    for (var j = 1; j < order.length; j++) {
      var e = order[j];
      if (counts[e] > bestCount) {
        best = e;
        bestCount = counts[e];
      }
    }
    // Tie: prefer first file's allowed ext
    var firstExt = normalizeExt(fileExt(files[0].name));
    if (ALLOWED_FORMATS[firstExt] && counts[firstExt] === bestCount) {
      return firstExt;
    }
    return best;
  }

  function suggestOutputFormat(files) {
    if (userTouchedFormat) return;
    var formatEl = $("output_format");
    if (!formatEl || !files || !files.length) return;
    var suggested = mostCommonAudioExt(files);
    if (formatEl.querySelector('option[value="' + suggested + '"]')) {
      formatEl.value = suggested;
      lastSuggestedFormat = suggested;
      updateBitrateVisibility();
      persistFormState();
    }
  }

  function updateBitrateVisibility() {
    var formatEl = $("output_format");
    var field = $("audioBitrateField");
    var bitrateEl = $("audio_bitrate");
    if (!formatEl || !field) return;
    var lossless = formatEl.value === "wav" || formatEl.value === "flac";
    field.hidden = lossless;
    if (bitrateEl) bitrateEl.disabled = lossless;
  }

  function estimateSeconds(totalDur) {
    if (!totalDur) return 0;
    var formatEl = $("output_format");
    var bitrateEl = $("audio_bitrate");
    var format = formatEl ? formatEl.value : "mp3";
    var bitrate = bitrateEl ? bitrateEl.value : "original";
    var factor = bitrate === "original" && (format === "mp3" || format === "m4a") ? 0.12 : 0.4;
    return Math.max(totalDur * factor, 3);
  }

  function setConfigVisible(visible) {
    if (typeof window.setMergeAudioConfigVisible === "function") {
      window.setMergeAudioConfigVisible(visible);
      return;
    }
    var config = $("mergeAudioConfig");
    if (config) config.hidden = !visible;
  }

  function updateEstimate() {
    var estimateBox = $("estimateBox");
    var estimateTime = $("estimateTime");
    var estimateDuration = $("estimateDuration");
    if (!estimateBox || !estimateTime) return;

    var totalDur = 0;
    for (var i = 0; i < fileDurations.length; i++) {
      totalDur += fileDurations[i] || 0;
    }

    if (!(totalDur > 0) || fileDurations.length < 2) {
      estimateBox.hidden = true;
      return;
    }

    estimateTime.textContent = formatTime(estimateSeconds(totalDur));
    if (estimateDuration) {
      estimateDuration.hidden = false;
      estimateDuration.textContent =
        "Tổng độ dài: " + formatDuration(totalDur) + " · " + fileDurations.length + " file";
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

    var durations = [];
    for (var i = 0; i < files.length; i++) {
      var url = URL.createObjectURL(files[i]);
      try {
        durations.push(await probeDuration(url));
      } finally {
        URL.revokeObjectURL(url);
      }
      if (gen !== probeGeneration) return;
    }

    if (gen !== probeGeneration) return;
    fileDurations = durations;
    updateEstimate();
  }

  function onFilesChanged(files, durations) {
    if (durations) {
      fileDurations = durations;
    }
    var count = files ? files.length : 0;
    setConfigVisible(count >= 2);
    if (count >= 1) {
      suggestOutputFormat(files);
    }
    if (!durations) {
      probeFiles(files);
    } else {
      updateEstimate();
    }
  }

  function bindFormEvents() {
    var fileInput = $("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var files = fileInput.files;
        var count = files ? files.length : 0;
        setConfigVisible(count >= 2);
        if (count === 0) {
          userTouchedFormat = false;
          lastSuggestedFormat = "";
        }
        suggestOutputFormat(files);
        probeFiles(files);
      });
    }

    window.onMergeAudioFilesChanged = onFilesChanged;

    var formatEl = $("output_format");
    if (formatEl) {
      formatEl.addEventListener("change", function () {
        if (formatEl.value !== lastSuggestedFormat) {
          userTouchedFormat = true;
        }
        updateBitrateVisibility();
        persistFormState();
        updateEstimate();
      });
    }

    var bitrateEl = $("audio_bitrate");
    if (bitrateEl) {
      bitrateEl.addEventListener("change", function () {
        persistFormState();
        updateEstimate();
      });
    }

    applySavedFormState();
    updateBitrateVisibility();
    updateEstimate();

    if (fileInput && fileInput.files && fileInput.files.length >= 2) {
      setConfigVisible(true);
      probeFiles(fileInput.files);
    } else {
      setConfigVisible(false);
    }
  }

  window.clearMergeAudioPersistedOptions = clearPersistedFormState;
  window.resetMergeAudioForm = resetMergeAudioForm;
  window.initMergeAudioEstimate = bindFormEvents;
})();
