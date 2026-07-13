(function () {
  "use strict";

  var audioCtx = null;
  var sourceNodes = [];
  var tickTimer = null;
  var playStartedAt = 0;
  var segmentOffset = 0;
  var totalDuration = 0;
  var clipOffsets = [];
  var isPlaying = false;
  var isSeeking = false;
  var isLoading = false;
  var pausedAt = 0;
  var decodedCache = { key: "", buffers: null, durations: null };

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text, isError) {
    var el = $("mergePreviewStatus");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("trim-audio-player__status--error");
      return;
    }
    el.hidden = false;
    el.textContent = text;
    if (isError) {
      el.classList.add("trim-audio-player__status--error");
    } else {
      el.classList.remove("trim-audio-player__status--error");
    }
  }

  function formatClock(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var total = Math.floor(seconds);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function setPlayingUI(playing) {
    isPlaying = !!playing;
    var toggle = $("mergePreviewToggle");
    if (!toggle) return;
    toggle.classList.toggle("is-playing", isPlaying);
    toggle.setAttribute("aria-label", isPlaying ? "Tạm dừng" : "Phát");
    toggle.setAttribute("aria-pressed", isPlaying ? "true" : "false");
  }

  function updateTimeLabel(elapsed) {
    var timeEl = $("mergePreviewTime");
    if (!timeEl) return;
    var cur = Math.max(0, Math.min(elapsed || 0, totalDuration || 0));
    timeEl.textContent = formatClock(cur) + " / " + formatClock(totalDuration || 0);
  }

  function updateSeekbar(elapsed) {
    var seek = $("mergePreviewSeek");
    if (!seek || isSeeking) return;
    seek.max = String(totalDuration > 0 ? totalDuration : 0);
    seek.value = String(Math.max(0, Math.min(elapsed || 0, totalDuration || 0)));
    updateTimeLabel(elapsed);
  }

  function syncDurationMeta() {
    var seek = $("mergePreviewSeek");
    if (seek) {
      seek.max = String(totalDuration > 0 ? totalDuration : 0);
      if (parseFloat(seek.value) > totalDuration) {
        seek.value = "0";
        pausedAt = 0;
      }
    }
    updateSeekbar(pausedAt);
  }

  function stopSourceOnly() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    sourceNodes.forEach(function (node) {
      node.onended = null;
      try {
        node.stop(0);
      } catch (e) {
        /* already stopped */
      }
      try {
        node.disconnect();
      } catch (e2) {
        /* ignore */
      }
    });
    sourceNodes = [];
  }

  function stopPreview() {
    if (isPlaying && audioCtx) {
      pausedAt = Math.min(totalDuration, Math.max(0, audioCtx.currentTime - playStartedAt + segmentOffset));
    }
    stopSourceOnly();
    setPlayingUI(false);
    updateSeekbar(pausedAt);
  }

  function resetPreviewPosition() {
    stopSourceOnly();
    setPlayingUI(false);
    pausedAt = 0;
    segmentOffset = 0;
    updateSeekbar(0);
  }

  function ensureAudioContext() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      throw new Error("Trình duyệt không hỗ trợ Web Audio API.");
    }
    if (!audioCtx) {
      audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function filesCacheKey(files) {
    var parts = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      parts.push(f.name + ":" + f.size + ":" + f.lastModified);
    }
    return parts.join("|");
  }

  function decodeFile(ctx, file) {
    return file.arrayBuffer().then(function (ab) {
      return ctx.decodeAudioData(ab.slice(0));
    });
  }

  function buildTimeline(buffers) {
    var offsets = [];
    var total = 0;
    var durations = [];
    for (var i = 0; i < buffers.length; i++) {
      offsets.push(total);
      durations.push(buffers[i].duration);
      total += buffers[i].duration;
    }
    return { offsets: offsets, durations: durations, total: total };
  }

  function loadBuffers(files) {
    var key = filesCacheKey(files);
    if (decodedCache.key === key && decodedCache.buffers) {
      var timeline = buildTimeline(decodedCache.buffers);
      clipOffsets = timeline.offsets;
      totalDuration = timeline.total;
      syncDurationMeta();
      return Promise.resolve(decodedCache.buffers);
    }
    var ctx = ensureAudioContext();
    var chain = Promise.resolve([]);
    for (var i = 0; i < files.length; i++) {
      (function (file) {
        chain = chain.then(function (list) {
          return decodeFile(ctx, file).then(function (buf) {
            list.push(buf);
            return list;
          });
        });
      })(files[i]);
    }
    return chain.then(function (buffers) {
      var timeline = buildTimeline(buffers);
      clipOffsets = timeline.offsets;
      totalDuration = timeline.total;
      decodedCache = { key: key, buffers: buffers, durations: timeline.durations };
      syncDurationMeta();
      return buffers;
    });
  }

  function startTicker() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (!audioCtx || !isPlaying) return;
      var elapsed = audioCtx.currentTime - playStartedAt + segmentOffset;
      if (elapsed >= totalDuration) {
        pausedAt = 0;
        stopSourceOnly();
        setPlayingUI(false);
        updateSeekbar(0);
        setStatus("");
        return;
      }
      updateSeekbar(elapsed);
    }, 100);
  }

  function startPlayback(buffers, offset) {
    var ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      return ctx.resume().then(function () {
        return startPlayback(buffers, offset);
      });
    }

    stopSourceOnly();
    var timeline = buildTimeline(buffers);
    clipOffsets = timeline.offsets;
    totalDuration = timeline.total;

    offset = Math.max(0, Math.min(offset || 0, totalDuration));
    if (offset >= totalDuration) {
      offset = 0;
    }
    if (totalDuration <= 0) {
      setStatus("Không có audio để phát.", true);
      return;
    }

    segmentOffset = offset;
    playStartedAt = ctx.currentTime;
    pausedAt = offset;

    var startIndex = 0;
    for (var i = 0; i < clipOffsets.length; i++) {
      var clipEnd = clipOffsets[i] + buffers[i].duration;
      if (offset < clipEnd) {
        startIndex = i;
        break;
      }
      startIndex = i;
    }

    var when = ctx.currentTime;
    for (var j = startIndex; j < buffers.length; j++) {
      var buf = buffers[j];
      var clipStart = clipOffsets[j];
      var localOffset = j === startIndex ? Math.max(0, offset - clipStart) : 0;
      var remaining = buf.duration - localOffset;
      if (remaining <= 0) continue;

      var node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(ctx.destination);
      node.start(when, localOffset, remaining);
      sourceNodes.push(node);
      when += remaining;
    }

    if (sourceNodes.length === 0) {
      setPlayingUI(false);
      return;
    }

    var last = sourceNodes[sourceNodes.length - 1];
    last.onended = function () {
      if (!isPlaying) return;
      pausedAt = 0;
      stopSourceOnly();
      setPlayingUI(false);
      updateSeekbar(0);
      setStatus("");
    };

    setPlayingUI(true);
    setStatus("");
    updateSeekbar(offset);
    startTicker();
  }

  function playFrom(offset) {
    var fileInput = $("file");
    if (!fileInput || !fileInput.files || fileInput.files.length < 2) {
      setStatus("Cần ít nhất 2 file audio để nghe thử.", true);
      return;
    }

    var files = Array.from(fileInput.files);
    isLoading = true;
    setStatus("Đang giải mã audio…");

    loadBuffers(files)
      .then(function (buffers) {
        isLoading = false;
        return startPlayback(buffers, offset);
      })
      .catch(function (e) {
        isLoading = false;
        stopPreview();
        setStatus(e.message || "Không phát được bản ghép này.", true);
      });
  }

  function onToggleClick() {
    if (isLoading) return;
    if (isPlaying) {
      stopPreview();
      setStatus("");
      return;
    }
    playFrom(pausedAt || 0);
  }

  function onSeekInput() {
    isSeeking = true;
    var seek = $("mergePreviewSeek");
    var value = seek ? parseFloat(seek.value) || 0 : 0;
    updateTimeLabel(value);
  }

  function onSeekCommit() {
    var seek = $("mergePreviewSeek");
    var value = seek ? parseFloat(seek.value) || 0 : 0;
    var wasPlaying = isPlaying;
    isSeeking = false;
    pausedAt = value;
    updateSeekbar(value);
    if (wasPlaying) {
      playFrom(value);
    }
  }

  function invalidateOnChange() {
    resetPreviewPosition();
    decodedCache = { key: "", buffers: null, durations: null };
    totalDuration = 0;
    clipOffsets = [];
    setStatus("");
    syncDurationMeta();
  }

  function setConfigVisible(visible) {
    var config = $("mergeAudioConfig");
    if (!config) return;
    config.hidden = !visible;
    if (!visible) {
      resetPreviewPosition();
      setStatus("");
    } else {
      syncDurationMeta();
    }
  }

  function bindEvents() {
    var toggle = $("mergePreviewToggle");
    if (toggle) toggle.addEventListener("click", onToggleClick);

    var seek = $("mergePreviewSeek");
    if (seek) {
      seek.addEventListener("input", onSeekInput);
      seek.addEventListener("change", onSeekCommit);
    }

    var fileInput = $("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        invalidateOnChange();
        setConfigVisible(!!(fileInput.files && fileInput.files.length >= 2));
      });
      setConfigVisible(!!(fileInput.files && fileInput.files.length >= 2));
    } else {
      setConfigVisible(false);
    }

    window.addEventListener("beforeunload", function () {
      stopSourceOnly();
    });
  }

  window.stopMergeAudioPreview = function () {
    stopPreview();
  };
  window.setMergeAudioConfigVisible = setConfigVisible;
  window.initMergeAudioPreview = function () {
    bindEvents();
    setPlayingUI(false);
    syncDurationMeta();
  };
})();
