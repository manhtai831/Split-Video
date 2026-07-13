(function () {
  "use strict";

  var audioCtx = null;
  var sourceNode = null;
  var gainNode = null;
  var decodedCache = { key: "", buffer: null };
  var tickTimer = null;
  var playStartedAt = 0;
  var segmentOffset = 0;
  var segmentDuration = 0;
  var isPlaying = false;
  var isSeeking = false;
  var isLoading = false;
  var pausedAt = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text, isError) {
    var el = $("trimPreviewStatus");
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
    var toggle = $("trimPreviewToggle");
    if (!toggle) return;
    toggle.classList.toggle("is-playing", isPlaying);
    toggle.setAttribute("aria-label", isPlaying ? "Tạm dừng" : "Phát");
    toggle.setAttribute("aria-pressed", isPlaying ? "true" : "false");
  }

  function updateTimeLabel(elapsed) {
    var timeEl = $("trimPreviewTime");
    if (!timeEl) return;
    var p = getParams();
    var start = isFinite(p.start) && p.start >= 0 ? p.start : 0;
    var end = isFinite(p.end) && p.end > start ? p.end : start;
    var dur = end - start;
    var cur = Math.max(0, Math.min(elapsed || 0, dur));
    timeEl.textContent = formatClock(start + cur) + " / " + formatClock(end);
  }

  function updateSeekbar(elapsed) {
    var seek = $("trimPreviewSeek");
    if (!seek || isSeeking) return;
    seek.max = String(segmentDuration > 0 ? segmentDuration : 0);
    seek.value = String(Math.max(0, Math.min(elapsed || 0, segmentDuration || 0)));
    updateTimeLabel(elapsed);
  }

  function syncSegmentMeta() {
    var p = getParams();
    if (isFinite(p.start) && isFinite(p.end) && p.end > p.start) {
      segmentDuration = p.end - p.start;
    } else {
      segmentDuration = 0;
    }
    var seek = $("trimPreviewSeek");
    if (seek) {
      seek.max = String(segmentDuration);
      if (parseFloat(seek.value) > segmentDuration) {
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
    if (sourceNode) {
      sourceNode.onended = null;
      try {
        sourceNode.stop(0);
      } catch (e) {
        /* already stopped */
      }
      try {
        sourceNode.disconnect();
      } catch (e2) {
        /* ignore */
      }
      sourceNode = null;
    }
    if (gainNode) {
      try {
        gainNode.disconnect();
      } catch (e3) {
        /* ignore */
      }
      gainNode = null;
    }
  }

  function stopPreview() {
    if (isPlaying && audioCtx) {
      pausedAt = Math.min(segmentDuration, Math.max(0, audioCtx.currentTime - playStartedAt + segmentOffset));
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

  function getParams() {
    var start = parseFloat($("start") ? $("start").value : "0");
    var end = parseFloat($("end") ? $("end").value : "");
    var fadeIn = parseFloat($("fade_in") ? $("fade_in").value : "0");
    var fadeOut = parseFloat($("fade_out") ? $("fade_out").value : "0");
    return { start: start, end: end, fadeIn: fadeIn, fadeOut: fadeOut };
  }

  function validateParams(p) {
    if (!isFinite(p.start) || p.start < 0) {
      return "Thời điểm bắt đầu không hợp lệ.";
    }
    if (!isFinite(p.end) || p.end <= p.start) {
      return "Thời điểm kết thúc phải lớn hơn thời điểm bắt đầu.";
    }
    if (!isFinite(p.fadeIn) || p.fadeIn < 0) {
      return "Fade in không hợp lệ.";
    }
    if (!isFinite(p.fadeOut) || p.fadeOut < 0) {
      return "Fade out không hợp lệ.";
    }
    if (p.fadeIn + p.fadeOut > p.end - p.start) {
      return "Fade quá dài: fade in + fade out không được vượt quá độ dài đoạn cắt.";
    }
    return null;
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

  function fileCacheKey(file) {
    return file.name + ":" + file.size + ":" + file.lastModified;
  }

  function decodeFile(file) {
    var key = fileCacheKey(file);
    if (decodedCache.key === key && decodedCache.buffer) {
      return Promise.resolve(decodedCache.buffer);
    }
    return file.arrayBuffer().then(function (ab) {
      var ctx = ensureAudioContext();
      return ctx.decodeAudioData(ab.slice(0)).then(function (buffer) {
        decodedCache = { key: key, buffer: buffer };
        return buffer;
      });
    });
  }

  function startTicker() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (!audioCtx || !isPlaying) return;
      var elapsed = audioCtx.currentTime - playStartedAt + segmentOffset;
      if (elapsed >= segmentDuration) {
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

  function scheduleGain(ctx, fadeIn, fadeOut, offset, remaining) {
    var now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(1, now);

    if (!(remaining > 0)) return;

    if (fadeIn > 0 && offset < fadeIn) {
      var startGain = Math.min(1, offset / fadeIn);
      var fadeInLeft = fadeIn - offset;
      gainNode.gain.setValueAtTime(startGain, now);
      gainNode.gain.linearRampToValueAtTime(1, now + Math.min(fadeInLeft, remaining));
    }

    if (fadeOut > 0) {
      var fadeOutStartInSegment = segmentDuration - fadeOut;
      if (offset + remaining > fadeOutStartInSegment) {
        var whenFadeOut = Math.max(0, fadeOutStartInSegment - offset);
        var fadeOutDur = Math.min(fadeOut, remaining - whenFadeOut);
        if (fadeOutDur > 0) {
          var gainAtOut =
            offset >= fadeOutStartInSegment
              ? Math.max(0, 1 - (offset - fadeOutStartInSegment) / fadeOut)
              : 1;
          gainNode.gain.setValueAtTime(gainAtOut, now + whenFadeOut);
          gainNode.gain.linearRampToValueAtTime(0, now + whenFadeOut + fadeOutDur);
        }
      }
    }
  }

  function playFrom(offset) {
    var fileInput = $("file");
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setStatus("Cần chọn một file audio.", true);
      return;
    }

    var p = getParams();
    var err = validateParams(p);
    if (err) {
      setStatus(err, true);
      return;
    }

    syncSegmentMeta();
    if (segmentDuration <= 0) {
      setStatus("Đoạn cắt không hợp lệ.", true);
      return;
    }

    offset = Math.max(0, Math.min(offset || 0, segmentDuration));
    if (offset >= segmentDuration) {
      offset = 0;
    }

    var file = fileInput.files[0];
    isLoading = true;
    setStatus("Đang giải mã audio…");

    decodeFile(file)
      .then(function (buffer) {
        isLoading = false;
        if (p.end > buffer.duration + 0.05) {
          setStatus(
            "End (" + p.end + "s) vượt thời lượng file (" + buffer.duration.toFixed(2) + "s).",
            true
          );
          setPlayingUI(false);
          return;
        }
        return startPlayback(buffer, p, offset);
      })
      .catch(function (e) {
        isLoading = false;
        stopPreview();
        setStatus(e.message || "Không phát được file audio này.", true);
      });
  }

  function startPlayback(buffer, p, offset) {
    var ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      return ctx.resume().then(function () {
        return startPlayback(buffer, p, offset);
      });
    }

    stopSourceOnly();

    var absStart = Math.max(0, p.start);
    var absEnd = Math.min(p.end, buffer.duration);
    var fullDur = absEnd - absStart;
    if (fullDur <= 0) {
      setStatus("Đoạn cắt nằm ngoài thời lượng file.", true);
      return;
    }

    segmentDuration = fullDur;
    segmentOffset = offset;
    var remaining = fullDur - offset;
    if (remaining <= 0) {
      pausedAt = 0;
      updateSeekbar(0);
      setPlayingUI(false);
      return;
    }

    var fadeIn = Math.min(p.fadeIn, fullDur);
    var fadeOut = Math.min(p.fadeOut, fullDur - fadeIn);

    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    gainNode = ctx.createGain();
    scheduleGain(ctx, fadeIn, fadeOut, offset, remaining);

    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    playStartedAt = ctx.currentTime;
    pausedAt = offset;

    sourceNode.onended = function () {
      if (!isPlaying) return;
      pausedAt = 0;
      stopSourceOnly();
      setPlayingUI(false);
      updateSeekbar(0);
      setStatus("");
    };

    sourceNode.start(ctx.currentTime, absStart + offset, remaining);
    setPlayingUI(true);
    setStatus("");
    updateSeekbar(offset);
    startTicker();
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
    var seek = $("trimPreviewSeek");
    var value = seek ? parseFloat(seek.value) || 0 : 0;
    updateTimeLabel(value);
  }

  function onSeekCommit() {
    if (!isSeeking && !isPlaying) {
      /* still allow commit from change when not dragging mid-play */
    }
    var seek = $("trimPreviewSeek");
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
    decodedCache = { key: "", buffer: null };
    setStatus("");
    syncSegmentMeta();
  }

  function setConfigVisible(visible) {
    var config = $("trimAudioConfig");
    if (!config) return;
    config.hidden = !visible;
    if (!visible) {
      resetPreviewPosition();
      setStatus("");
    } else {
      syncSegmentMeta();
    }
  }

  function bindEvents() {
    var toggle = $("trimPreviewToggle");
    if (toggle) toggle.addEventListener("click", onToggleClick);

    var seek = $("trimPreviewSeek");
    if (seek) {
      seek.addEventListener("input", onSeekInput);
      seek.addEventListener("change", onSeekCommit);
    }

    ["start", "end", "fade_in", "fade_out"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        invalidateOnChange();
      });
      el.addEventListener("input", function () {
        syncSegmentMeta();
        if (isPlaying) {
          stopPreview();
        }
      });
    });

    var fileInput = $("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        invalidateOnChange();
        setConfigVisible(!!(fileInput.files && fileInput.files.length));
      });
      setConfigVisible(!!(fileInput.files && fileInput.files.length));
    } else {
      setConfigVisible(false);
    }

    window.addEventListener("beforeunload", function () {
      stopSourceOnly();
    });
  }

  window.stopTrimAudioPreview = function () {
    stopPreview();
  };
  window.setTrimAudioConfigVisible = setConfigVisible;
  window.syncTrimAudioSegmentMeta = syncSegmentMeta;
  window.initTrimAudioPreview = function () {
    bindEvents();
    setPlayingUI(false);
    syncSegmentMeta();
  };
})();
