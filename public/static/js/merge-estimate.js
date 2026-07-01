(function () {
  "use strict";

  var BASE_ENCODE_MULTIPLIER = 1.5;

  var PRESET_FACTORS = {
    ultrafast: 0.25,
    superfast: 0.35,
    veryfast: 0.5,
    faster: 0.65,
    fast: 0.8,
    medium: 1.0,
    slow: 1.5,
    slower: 2.5,
    veryslow: 4.0,
  };

  var AUDIO_OPTIONS_REENCODE = [
    { value: "aac", label: "AAC — nén lại" },
    { value: "copy", label: "Copy — giữ nguyên track gốc" },
    { value: "mute", label: "Mute — tắt âm thanh" },
  ];

  var AUDIO_OPTIONS_KEEP = [
    { value: "copy", label: "Copy — giữ nguyên track gốc" },
    { value: "mute", label: "Mute — tắt âm thanh" },
  ];

  var FORM_STORAGE_KEY = "mergeForm.options";

  var PERSISTED_FIELD_IDS = [
    "size",
    "output_format",
    "crf",
    "fps",
    "preset",
    "audio_codec",
    "audio_bitrate",
  ];

  var fileStats = [];
  var clipMeta = [];

  function readFormStateFromStorage() {
    try {
      var raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function writeFormStateToStorage(state) {
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function collectFormState() {
    var state = {};
    PERSISTED_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) state[id] = el.value;
    });
    return state;
  }

  function applySavedFormState() {
    var saved = readFormStateFromStorage();
    if (!saved) return;

    PERSISTED_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
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

  function effectiveDuration(meta) {
    if (!meta) return 0;
    if (meta.kind === "video") return meta.duration || 0;
    if (meta.kind === "image") return meta.holdDuration > 0 ? meta.holdDuration : 2;
    if (meta.kind === "gif") {
      if (meta.holdDuration > 0) return meta.holdDuration;
      if (meta.nativeDuration > 0) return meta.nativeDuration;
      return 2;
    }
    return meta.duration || 0;
  }

  function hasImageClips(metas) {
    for (var i = 0; i < (metas || []).length; i++) {
      if (metas[i].kind === "image" || metas[i].kind === "gif") return true;
    }
    return false;
  }

  function isFastMergeMode() {
    var size = document.getElementById("size");
    if (!size || size.value !== "keep") return false;
    if (clipMeta.length < 2) return false;
    if (hasImageClips(clipMeta)) return false;
    var ref = clipMeta[0];
    for (var i = 1; i < clipMeta.length; i++) {
      if (
        clipMeta[i].width !== ref.width ||
        clipMeta[i].height !== ref.height
      ) {
        return false;
      }
    }
    return true;
  }

  function estimateSeconds() {
    if (!fileStats.length) return 0;

    if (isFastMergeMode()) {
      return Math.max(5, fileStats.length * 2);
    }

    var totalDuration = 0;
    fileStats.forEach(function (stat, i) {
      totalDuration += effectiveDuration(clipMeta[i]) || stat.duration || 0;
    });
    if (totalDuration <= 0) return 0;

    var size = document.getElementById("size").value;
    if (size === "keep") {
      return Math.max(totalDuration * 0.5, 10);
    }

    var width = parseInt(size, 10);
    var resFactor = Math.pow(width / 1080, 2);
    var preset = document.getElementById("preset").value;
    var presetFactor = PRESET_FACTORS[preset] || 1.0;
    var fpsRaw = document.getElementById("fps").value;
    var fps = fpsRaw === "default" ? 15 : parseInt(fpsRaw, 10) || 15;
    var fpsFactor = fpsRaw === "default" ? 1.0 : fps / 15;
    var crf = parseInt(document.getElementById("crf").value, 10) || 23;
    var crfFactor = 1 + (23 - crf) * 0.05;
    var audioCodec = document.getElementById("audio_codec").value;
    var audioFactor = audioCodec === "aac" ? 1.05 : 1.0;

    return Math.max(
      totalDuration *
        BASE_ENCODE_MULTIPLIER *
        resFactor *
        presetFactor *
        fpsFactor *
        crfFactor *
        audioFactor,
      10
    );
  }

  function updateEstimate() {
    var estimateBox = document.getElementById("estimateBox");
    var estimateTime = document.getElementById("estimateTime");
    if (!estimateBox || !estimateTime) return;

    if (fileStats.length < 2) {
      estimateBox.hidden = true;
      return;
    }

    var modeHint = isFastMergeMode() ? " (ghép nhanh)" : " (re-encode)";
    estimateTime.textContent = formatTime(estimateSeconds()) + modeHint;
    estimateBox.hidden = false;
  }

  function setAudioOptions(isKeep) {
    var select = document.getElementById("audio_codec");
    if (!select) return;

    var current = select.value;
    var options = isKeep ? AUDIO_OPTIONS_KEEP : AUDIO_OPTIONS_REENCODE;
    var defaultValue = isKeep ? "copy" : "aac";

    select.innerHTML = "";
    options.forEach(function (opt) {
      var el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      select.appendChild(el);
    });

    var valid = options.some(function (opt) {
      return opt.value === current;
    });
    select.value = valid ? current : defaultValue;
  }

  function updateAudioBitrateVisibility() {
    var audioCodec = document.getElementById("audio_codec");
    var field = document.getElementById("audioBitrateField");
    if (!audioCodec || !field) return;
    var show = audioCodec.value === "aac";
    field.hidden = !show;
    var select = field.querySelector("select");
    if (select) select.disabled = !show;
  }

  function updateEncodeSettingsVisibility() {
    var size = document.getElementById("size");
    var encodeSettings = document.getElementById("encodeSettings");
    if (!size || !encodeSettings) return;
    var isKeep = size.value === "keep";
    encodeSettings.hidden = isKeep;
    encodeSettings.querySelectorAll("input, select").forEach(function (el) {
      el.disabled = isKeep;
    });
    setAudioOptions(isKeep);
    updateAudioBitrateVisibility();
  }

  function onFilesChanged(files, metas) {
    clipMeta = metas || [];
    fileStats = (files || []).map(function (file, i) {
      return {
        duration: effectiveDuration(metas[i]),
        size: file.size || 0,
      };
    });
    updateEstimate();
  }

  function bindFormEvents() {
    var form = document.getElementById("mergeForm");
    if (!form) return;

    PERSISTED_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", function () {
        if (id === "size") {
          updateEncodeSettingsVisibility();
        }
        if (id === "audio_codec") {
          updateAudioBitrateVisibility();
        }
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

    applySavedFormState();
    updateEncodeSettingsVisibility();
    updateEstimate();
  }

  window.MergeEstimate = {
    onFilesChanged: onFilesChanged,
    updateEstimate: updateEstimate,
  };

  window.initMergeEstimate = bindFormEvents;
})();
