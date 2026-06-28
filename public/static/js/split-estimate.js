(function () {
  const SIZE_LIMIT = 8 * 1024 * 1024;
  const BASE_ENCODE_MULTIPLIER = 1.5;

  const PRESET_FACTORS = {
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

  const AUDIO_OPTIONS_REENCODE = [
    { value: "aac", label: "AAC — nén lại" },
    { value: "copy", label: "Copy — giữ nguyên track gốc" },
    { value: "mute", label: "Mute — tắt âm thanh" },
  ];

  const AUDIO_OPTIONS_KEEP = [
    { value: "copy", label: "Copy — giữ nguyên track gốc" },
    { value: "mute", label: "Mute — tắt âm thanh" },
  ];

  let videoDuration = 0;
  let fileSize = 0;
  let objectUrl = null;

  function formatTime(totalSeconds) {
    if (totalSeconds < 60) {
      return "< 1 phút";
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    if (seconds === 0) {
      return "~" + minutes + " phút";
    }
    return "~" + minutes + " phút " + seconds + " giây";
  }

  function estimateSeconds() {
    if (!videoDuration || !fileSize) {
      return 0;
    }

    const size = document.getElementById("size").value;
    const segmentCount = Math.ceil(fileSize / SIZE_LIMIT);
    const splitOverhead = segmentCount * 2;

    if (size === "keep") {
      return Math.max(videoDuration * 0.2 + splitOverhead, 5);
    }

    const width = parseInt(size, 10);
    const resFactor = Math.pow(width / 1080, 2);
    const preset = document.getElementById("preset").value;
    const presetFactor = PRESET_FACTORS[preset] || 1.0;
    const fpsRaw = document.getElementById("fps").value;
    const fps = fpsRaw === "default" ? 15 : parseInt(fpsRaw, 10) || 15;
    const fpsFactor = fpsRaw === "default" ? 1.0 : fps / 15;
    const crf = parseInt(document.getElementById("crf").value, 10) || 23;
    const crfFactor = 1 + (23 - crf) * 0.05;
    const audioCodec = document.getElementById("audio_codec").value;
    const audioFactor = audioCodec === "aac" ? 1.05 : 1.0;

    const encodeSeconds =
      videoDuration *
        BASE_ENCODE_MULTIPLIER *
        resFactor *
        presetFactor *
        fpsFactor *
        crfFactor *
        audioFactor +
      splitOverhead;

    return Math.max(encodeSeconds, 5);
  }

  function updateEstimate() {
    const estimateBox = document.getElementById("estimateBox");
    const estimateTime = document.getElementById("estimateTime");
    if (!estimateBox || !estimateTime) {
      return;
    }

    if (!videoDuration || !fileSize) {
      estimateBox.hidden = true;
      return;
    }

    estimateTime.textContent = formatTime(estimateSeconds());
    estimateBox.hidden = false;
  }

  function setAudioOptions(isKeep) {
    const select = document.getElementById("audio_codec");
    if (!select) {
      return;
    }

    const current = select.value;
    const options = isKeep ? AUDIO_OPTIONS_KEEP : AUDIO_OPTIONS_REENCODE;
    const defaultValue = isKeep ? "copy" : "aac";

    select.innerHTML = "";
    options.forEach(function (opt) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      select.appendChild(el);
    });

    const valid = options.some(function (opt) {
      return opt.value === current;
    });
    select.value = valid ? current : defaultValue;
  }

  function updateAudioBitrateVisibility() {
    const audioCodec = document.getElementById("audio_codec");
    const field = document.getElementById("audioBitrateField");
    if (!audioCodec || !field) {
      return;
    }
    const show = audioCodec.value === "aac";
    field.hidden = !show;
    field.querySelector("select").disabled = !show;
  }

  function updateEncodeSettingsVisibility() {
    const size = document.getElementById("size");
    const encodeSettings = document.getElementById("encodeSettings");
    if (!size || !encodeSettings) {
      return;
    }
    const isKeep = size.value === "keep";
    encodeSettings.hidden = isKeep;
    encodeSettings.querySelectorAll("input, select").forEach(function (el) {
      el.disabled = isKeep;
    });
    setAudioOptions(isKeep);
    updateAudioBitrateVisibility();
  }

  function probeFile(file) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }

    videoDuration = 0;
    fileSize = file.size || 0;

    if (!file) {
      updateEstimate();
      return;
    }

    objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = function () {
      videoDuration = video.duration || 0;
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      updateEstimate();
    };
    video.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      updateEstimate();
    };
    video.src = objectUrl;
  }

  function bindFormEvents() {
    const form = document.getElementById("splitForm");
    if (!form) {
      return;
    }

    const fileInput = document.getElementById("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        probeFile(fileInput.files && fileInput.files[0]);
      });
    }

    ["size", "crf", "fps", "preset", "audio_codec", "audio_bitrate"].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) {
        return;
      }
      el.addEventListener("change", function () {
        if (id === "size") {
          updateEncodeSettingsVisibility();
        }
        if (id === "audio_codec") {
          updateAudioBitrateVisibility();
        }
        updateEstimate();
      });
      if (el.type === "number") {
        el.addEventListener("input", updateEstimate);
      }
    });

    updateEncodeSettingsVisibility();
    updateEstimate();
  }

  window.initSplitEstimate = bindFormEvents;
})();
