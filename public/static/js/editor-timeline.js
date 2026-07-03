(function () {
  "use strict";

  var timelineEl = null;
  var playheadEl = null;
  var timeDisplayEl = null;
  var playPauseBtn = null;
  var videoEl = null;
  var getDuration = null;
  var getCurrentTime = null;
  var setCurrentTime = null;
  var onTimeUpdate = null;

  var dragging = false;
  var rafId = null;
  var lastDisplayedSecond = -1;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function timeToPct(t) {
    var dur = getDuration ? getDuration() : 0;
    if (!dur) return 0;
    return (t / dur) * 100;
  }

  function pctToTime(pct) {
    var dur = getDuration ? getDuration() : 0;
    return (pct / 100) * dur;
  }

  function updatePlayheadPosition(t) {
    if (!playheadEl) return;
    playheadEl.style.left = timeToPct(t) + "%";
  }

  function updateTimeDisplay(t) {
    if (!timeDisplayEl) return;
    var cur = t != null ? t : getCurrentTime ? getCurrentTime() : 0;
    var dur = getDuration ? getDuration() : 0;
    var sec = Math.floor(cur);
    if (sec === lastDisplayedSecond && t == null) return;
    lastDisplayedSecond = sec;
    timeDisplayEl.textContent = formatTime(cur) + " / " + formatTime(dur);
  }

  function updatePlayhead() {
    var t = getCurrentTime ? getCurrentTime() : 0;
    updatePlayheadPosition(t);
    updateTimeDisplay(t);
  }

  function tick() {
    if (!videoEl || videoEl.paused || videoEl.ended) {
      stopRaf();
      return;
    }
    var t = videoEl.currentTime;
    if (setCurrentTime) setCurrentTime(t, { silent: true });
    updatePlayheadPosition(t);
    updateTimeDisplay(t);
    if (onTimeUpdate) onTimeUpdate(t);
    rafId = requestAnimationFrame(tick);
  }

  function startRaf() {
    stopRaf();
    rafId = requestAnimationFrame(tick);
  }

  function stopRaf() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function seekFromEvent(e) {
    if (!timelineEl) return;
    var rect = timelineEl.getBoundingClientRect();
    var pct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    var t = pctToTime(pct);
    if (setCurrentTime) setCurrentTime(t);
    updatePlayheadPosition(t);
    updateTimeDisplay(t);
    if (onTimeUpdate) onTimeUpdate(t);
  }

  function onPointerDown(e) {
    if (e.target.closest(".editor-caption-segment")) return;
    e.preventDefault();
    dragging = true;
    stopRaf();
    timelineEl.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    seekFromEvent(e);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    timelineEl.releasePointerCapture(e.pointerId);
    if (videoEl && !videoEl.paused && !videoEl.ended) startRaf();
  }

  function updatePlayPauseButton() {
    if (!playPauseBtn || !videoEl) return;
    var playing = !videoEl.paused && !videoEl.ended;
    playPauseBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
    playPauseBtn.title = playing ? "Pause" : "Play";
    playPauseBtn.setAttribute("aria-pressed", playing ? "true" : "false");
  }

  function bindVideo() {
    if (!videoEl) return;
    videoEl.addEventListener("timeupdate", function () {
      if (rafId != null) return;
      updatePlayhead();
      if (onTimeUpdate) onTimeUpdate(videoEl.currentTime);
    });
    videoEl.addEventListener("loadedmetadata", function () {
      lastDisplayedSecond = -1;
      updateTimeDisplay();
    });
    videoEl.addEventListener("play", function () {
      updatePlayPauseButton();
      startRaf();
    });
    videoEl.addEventListener("pause", function () {
      updatePlayPauseButton();
      stopRaf();
      updatePlayhead();
    });
    videoEl.addEventListener("ended", function () {
      updatePlayPauseButton();
      stopRaf();
      updatePlayhead();
    });
  }

  function play() {
    if (videoEl) videoEl.play();
  }

  function pause() {
    if (videoEl) videoEl.pause();
  }

  function togglePlayPause() {
    if (!videoEl) return;
    if (videoEl.paused || videoEl.ended) {
      if (videoEl.ended) videoEl.currentTime = 0;
      play();
    } else {
      pause();
    }
  }

  function init(opts) {
    timelineEl = opts.timelineEl;
    playheadEl = opts.playheadEl;
    timeDisplayEl = opts.timeDisplayEl;
    playPauseBtn = opts.playPauseBtn;
    videoEl = opts.videoEl;
    getDuration = opts.getDuration;
    getCurrentTime = opts.getCurrentTime;
    setCurrentTime = opts.setCurrentTime;
    onTimeUpdate = opts.onTimeUpdate;

    if (timelineEl) {
      timelineEl.addEventListener("pointerdown", onPointerDown);
      timelineEl.addEventListener("pointermove", onPointerMove);
      timelineEl.addEventListener("pointerup", onPointerUp);
      timelineEl.addEventListener("pointercancel", onPointerUp);
    }
    bindVideo();
  }

  window.EditorTimeline = {
    init: init,
    updatePlayhead: updatePlayhead,
    updateTimeDisplay: updateTimeDisplay,
    play: play,
    pause: pause,
    togglePlayPause: togglePlayPause,
    updatePlayPauseButton: updatePlayPauseButton,
    timeToPct: timeToPct,
    pctToTime: pctToTime,
    formatTime: formatTime,
  };
})();
