(function () {
  const BASE_ENCODE_MULTIPLIER = 1.5;

  const UNIT_MULTIPLIERS = {
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const TIME_UNIT_MULTIPLIERS = {
    sec: 1,
    min: 60,
    hour: 3600,
  };

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

  const FORM_STORAGE_KEY = "splitForm.options";

  const PERSISTED_FIELD_IDS = [
    "size",
    "split_size",
    "split_unit",
    "split_time",
    "split_time_unit",
    "output_format",
    "crf",
    "fps",
    "preset",
    "audio_codec",
    "audio_bitrate",
  ];

  let fileStats = [];
  let probeGeneration = 0;

  function readFormStateFromStorage() {
    try {
      const raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
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
    const state = { split_mode: getSplitMode() };
    PERSISTED_FIELD_IDS.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) {
        state[id] = el.value;
      }
    });
    return state;
  }

  function applySavedFormState() {
    const saved = readFormStateFromStorage();
    if (!saved) {
      return;
    }

    if (saved.split_mode === "size" || saved.split_mode === "time") {
      const radio = document.querySelector(
        'input[name="split_mode"][value="' + saved.split_mode + '"]'
      );
      if (radio) {
        radio.checked = true;
      }
    }

    PERSISTED_FIELD_IDS.forEach(function (id) {
      const el = document.getElementById(id);
      const value = saved[id];
      if (!el || value === undefined || value === null) {
        return;
      }
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

  function getSplitMode() {
    const checked = document.querySelector('input[name="split_mode"]:checked');
    return checked ? checked.value : "size";
  }

  function getTimeLimitSeconds() {
    const amountEl = document.getElementById("split_time");
    const unitEl = document.getElementById("split_time_unit");
    if (!amountEl) {
      return 0;
    }

    const amount = parseFloat(amountEl.value);
    if (!amount || amount <= 0) {
      return 0;
    }

    const unit = unitEl ? unitEl.value : "min";
    const multiplier = TIME_UNIT_MULTIPLIERS[unit] || TIME_UNIT_MULTIPLIERS.min;
    return amount * multiplier;
  }

  function getSizeLimitBytes() {
    const amountEl = document.getElementById("split_size");
    const unitEl = document.getElementById("split_unit");
    if (!amountEl) {
      return 0;
    }

    const amount = parseInt(amountEl.value, 10);
    if (!amount || amount <= 0) {
      return 0;
    }

    const unit = unitEl ? unitEl.value : "mb";
    const multiplier = UNIT_MULTIPLIERS[unit] || UNIT_MULTIPLIERS.mb;
    return amount * multiplier;
  }

  function getSegmentCountForFile(videoDuration, fileSize) {
    if (getSplitMode() === "time") {
      const timeLimit = getTimeLimitSeconds();
      if (timeLimit <= 0 || !videoDuration) {
        return 1;
      }
      return Math.ceil(videoDuration / timeLimit);
    }

    const sizeLimit = getSizeLimitBytes();
    if (sizeLimit <= 0) {
      return 1;
    }
    return Math.ceil(fileSize / sizeLimit);
  }

  function estimateSecondsForFile(videoDuration, fileSize) {
    if (!videoDuration || !fileSize) {
      return 0;
    }

    const size = document.getElementById("size").value;
    const segmentCount = getSegmentCountForFile(videoDuration, fileSize);
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

  function estimateSeconds() {
    if (!fileStats.length) {
      return 0;
    }

    let total = 0;
    fileStats.forEach(function (stat) {
      total += estimateSecondsForFile(stat.duration, stat.size);
    });
    return total;
  }

  function countEstimableFiles() {
    return fileStats.filter(function (stat) {
      return stat.duration > 0 && stat.size > 0;
    }).length;
  }

  function updateEstimate() {
    const estimateBox = document.getElementById("estimateBox");
    const estimateTime = document.getElementById("estimateTime");
    if (!estimateBox || !estimateTime) {
      return;
    }

    if (!countEstimableFiles()) {
      estimateBox.hidden = true;
      return;
    }

    const timeText = formatTime(estimateSeconds());
    const fileCount = countEstimableFiles();
    estimateTime.textContent =
      fileCount > 1 ? timeText + " (" + fileCount + " file)" : timeText;
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

  function updateSplitModePanels() {
    const mode = getSplitMode();
    const sizePanel = document.getElementById("splitBySizePanel");
    const timePanel = document.getElementById("splitByTimePanel");
    if (!sizePanel || !timePanel) {
      return;
    }

    const isTime = mode === "time";
    sizePanel.style.display = isTime ? "none" : "flex";
    timePanel.style.display = isTime ? "flex" : "none";

    sizePanel.querySelectorAll("input, select").forEach(function (el) {
      el.disabled = isTime;
    });
    timePanel.querySelectorAll("input, select").forEach(function (el) {
      el.disabled = !isTime;
    });
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

  function probeDuration(url) {
    return new Promise(function (resolve) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      function cleanup() {
        video.removeAttribute("src");
        video.load();
      }

      video.onloadedmetadata = function () {
        const duration = video.duration || 0;
        cleanup();
        resolve(duration);
      };
      video.onerror = function () {
        cleanup();
        resolve(0);
      };
      video.src = url;
    });
  }

  async function probeFiles(files) {
    const gen = ++probeGeneration;

    if (!files || files.length === 0) {
      fileStats = [];
      updateEstimate();
      return;
    }

    const items = Array.from(files);
    const results = await Promise.all(
      items.map(async function (file) {
        const url = URL.createObjectURL(file);
        try {
          const duration = await probeDuration(url);
          return { duration: duration, size: file.size || 0 };
        } finally {
          URL.revokeObjectURL(url);
        }
      })
    );

    if (gen !== probeGeneration) {
      return;
    }

    fileStats = results;
    updateEstimate();
  }

  function bindFormEvents() {
    const form = document.getElementById("splitForm");
    if (!form) {
      return;
    }

    const fileInput = document.getElementById("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        probeFiles(fileInput.files);
      });
    }

    document.querySelectorAll('input[name="split_mode"]').forEach(function (el) {
      el.addEventListener("change", function () {
        updateSplitModePanels();
        persistFormState();
        updateEstimate();
      });
    });

    PERSISTED_FIELD_IDS.forEach(function (id) {
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
    updateSplitModePanels();
    updateEncodeSettingsVisibility();
    updateEstimate();
  }

  window.initSplitEstimate = bindFormEvents;
})();
