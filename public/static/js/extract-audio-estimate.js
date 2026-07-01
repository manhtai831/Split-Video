(function () {
  "use strict";

  var FORM_STORAGE_KEY = "extractAudioForm.options";

  var PERSISTED_FIELD_IDS = [
    "output_format",
    "audio_bitrate",
    "volume",
    "speed",
    "meta_artist",
    "meta_album",
    "meta_year",
    "meta_comment",
  ];

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

  function getSpeed() {
    var el = $("speed");
    var speed = el ? parseFloat(el.value) : 1;
    return speed > 0 ? speed : 1;
  }

  function needsReencode() {
    var volume = $("volume") ? parseFloat($("volume").value) : 100;
    return volume !== 100 || getSpeed() !== 1;
  }

  function estimateSecondsForFile(duration) {
    if (!duration) return 0;
    var outputFormat = $("output_format") ? $("output_format").value : "mp3";
    var bitrate = $("audio_bitrate") ? $("audio_bitrate").value : "original";

    var factor = 0.4;
    if (outputFormat === "wav" || outputFormat === "flac") {
      factor = 0.6;
    }
    if (bitrate === "original" && !needsReencode()) {
      factor = 0.1;
    } else if (needsReencode()) {
      factor = 0.45;
    }

    return Math.max(duration * factor, 3);
  }

  function totalInputDuration() {
    return fileDurations.reduce(function (sum, d) {
      return sum + (d || 0);
    }, 0);
  }

  function totalOutputDuration() {
    var speed = getSpeed();
    return fileDurations.reduce(function (sum, d) {
      return sum + (d || 0) / speed;
    }, 0);
  }

  function updateBitrateVisibility() {
    var formatEl = $("output_format");
    var field = $("audioBitrateField");
    if (!formatEl || !field) return;
    var lossless = formatEl.value === "wav" || formatEl.value === "flac";
    field.hidden = lossless;
    var select = field.querySelector("select");
    if (select) select.disabled = lossless;
  }

  function updateVolumeLabel() {
    var volume = $("volume");
    var label = $("volumeLabel");
    if (volume && label) {
      label.textContent = volume.value + "%";
    }
  }

  function updateEstimate() {
    var estimateBox = $("estimateBox");
    var estimateTime = $("estimateTime");
    var estimateDuration = $("estimateDuration");
    if (!estimateBox || !estimateTime) return;

    var valid = fileDurations.filter(function (d) {
      return d > 0;
    });
    if (!valid.length) {
      estimateBox.hidden = true;
      return;
    }

    var totalSeconds = 0;
    valid.forEach(function (d) {
      totalSeconds += estimateSecondsForFile(d);
    });

    var timeText = formatTime(totalSeconds);
    if (valid.length > 1) {
      timeText += " (" + valid.length + " file)";
    }
    estimateTime.textContent = timeText;

    if (estimateDuration) {
      var speed = getSpeed();
      if (speed !== 1) {
        estimateDuration.hidden = false;
        estimateDuration.textContent =
          "Thời lượng audio ước tính: " + formatDuration(totalOutputDuration());
      } else {
        estimateDuration.hidden = true;
      }
    }

    estimateBox.hidden = false;
  }

  function probeDuration(url) {
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
        resolve(video.duration || 0);
        cleanup();
      };
      video.onerror = function () {
        cleanup();
        resolve(0);
      };
      video.src = url;
    });
  }

  async function probeFiles(files) {
    var gen = ++probeGeneration;
    if (!files || !files.length) {
      fileDurations = [];
      updateEstimate();
      return;
    }

    var results = await Promise.all(
      Array.from(files).map(async function (file) {
        var url = URL.createObjectURL(file);
        try {
          return await probeDuration(url);
        } finally {
          URL.revokeObjectURL(url);
        }
      })
    );

    if (gen !== probeGeneration) return;
    fileDurations = results;
    updateEstimate();
  }

  function bindFormEvents() {
    var fileInput = $("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        probeFiles(fileInput.files);
      });
    }

    window.onExtractAudioFilesChanged = function (durations) {
      fileDurations = durations || [];
      updateEstimate();
    };

    PERSISTED_FIELD_IDS.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        if (id === "output_format") updateBitrateVisibility();
        if (id === "volume") updateVolumeLabel();
        persistFormState();
        updateEstimate();
      });
      if (el.type === "range" || el.type === "number") {
        el.addEventListener("input", function () {
          if (id === "volume") updateVolumeLabel();
          persistFormState();
          updateEstimate();
        });
      }
    });

    applySavedFormState();
    updateBitrateVisibility();
    updateVolumeLabel();
    updateEstimate();

    if (fileInput && fileInput.files && fileInput.files.length) {
      probeFiles(fileInput.files);
    }
  }

  window.initExtractAudioEstimate = bindFormEvents;
})();
