(function () {
  "use strict";

  var videoDuration = 0;
  var startAt = 0;
  var duration = 5;
  var dragging = null;

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function timeToPct(t) {
    if (!videoDuration) return 0;
    return (t / videoDuration) * 100;
  }

  function pctToTime(pct) {
    return (pct / 100) * videoDuration;
  }

  function updateUI() {
    var timeline = $("gifTimeline");
    var range = $("gifTimelineRange");
    var thumbStart = $("gifThumbStart");
    var thumbEnd = $("gifThumbEnd");
    var startInput = $("startAt");
    var durationInput = $("duration");

    if (!timeline || !videoDuration) return;

    timeline.hidden = false;
    var endAt = startAt + duration;
    if (endAt > videoDuration) {
      endAt = videoDuration;
      duration = Math.max(0.1, endAt - startAt);
    }

    var startPct = timeToPct(startAt);
    var endPct = timeToPct(endAt);

    if (range) {
      range.style.left = startPct + "%";
      range.style.width = Math.max(0, endPct - startPct) + "%";
    }
    if (thumbStart) thumbStart.style.left = startPct + "%";
    if (thumbEnd) thumbEnd.style.left = endPct + "%";
    if (startInput && document.activeElement !== startInput) {
      startInput.value = startAt.toFixed(1);
    }
    if (durationInput && document.activeElement !== durationInput) {
      durationInput.value = duration.toFixed(1);
    }

    if (typeof window.onGifTimelineChanged === "function") {
      window.onGifTimelineChanged(startAt, duration);
    }
  }

  function seekPlayer() {
    var player = $("gifPreviewPlayer");
    if (player && isFinite(startAt)) {
      player.currentTime = startAt;
    }
  }

  function fillEditor(newStart, newDuration) {
    startAt = clamp(newStart, 0, Math.max(0, videoDuration - 0.1));
    duration = clamp(newDuration, 0.1, 30);
    if (startAt + duration > videoDuration) {
      duration = Math.max(0.1, videoDuration - startAt);
    }
    updateUI();
    seekPlayer();
  }

  function readEditor() {
    return { start_at: startAt, duration: duration };
  }

  function clearEditor() {
    fillEditor(0, Math.min(5, videoDuration || 5));
  }

  function onPointerDown(which, e) {
    e.preventDefault();
    dragging = which;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    var timeline = $("gifTimeline");
    if (!timeline || !videoDuration) return;

    var rect = timeline.getBoundingClientRect();
    var pct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    var t = pctToTime(pct);

    if (dragging === "start") {
      startAt = clamp(t, 0, startAt + duration - 0.1);
      if (startAt + duration > videoDuration) {
        duration = videoDuration - startAt;
      }
    } else {
      var endAt = clamp(t, startAt + 0.1, videoDuration);
      duration = clamp(endAt - startAt, 0.1, 30);
    }
    updateUI();
    seekPlayer();
  }

  function onPointerUp() {
    dragging = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  }

  function bindInputSync() {
    var startInput = $("startAt");
    var durationInput = $("duration");

    if (startInput) {
      startInput.addEventListener("change", function () {
        var v = parseFloat(startInput.value);
        if (!isFinite(v)) return;
        fillEditor(v, duration);
      });
    }
    if (durationInput) {
      durationInput.addEventListener("change", function () {
        var v = parseFloat(durationInput.value);
        if (!isFinite(v)) return;
        fillEditor(startAt, v);
      });
    }
  }

  function bindThumbs() {
    var thumbStart = $("gifThumbStart");
    var thumbEnd = $("gifThumbEnd");
    if (thumbStart) {
      thumbStart.addEventListener("pointerdown", function (e) {
        onPointerDown("start", e);
      });
    }
    if (thumbEnd) {
      thumbEnd.addEventListener("pointerdown", function (e) {
        onPointerDown("end", e);
      });
    }
  }

  function onVideoLoaded(meta) {
    videoDuration = meta.duration || 0;
    startAt = 0;
    duration = Math.min(5, Math.max(0.1, videoDuration * 0.1 || 5));
    if (duration > 30) duration = 30;
    updateUI();
  }

  function initGifTimeline() {
    bindInputSync();
    bindThumbs();

    window.onGifVideoLoaded = function (meta) {
      onVideoLoaded(meta);
    };

    window.fillGifEditor = fillEditor;
    window.readGifEditor = readEditor;
    window.clearGifEditor = clearEditor;
  }

  window.initGifTimeline = initGifTimeline;
})();
