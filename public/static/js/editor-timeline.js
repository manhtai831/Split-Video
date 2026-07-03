(function () {
  "use strict";

  var timelineEl = null;
  var playheadEl = null;
  var timeDisplayEl = null;
  var playPauseBtn = null;
  var getDuration = null;
  var getCurrentTime = null;
  var setCurrentTime = null;
  var onTimeUpdate = null;
  var onPlayStateChange = null;

  var dragging = false;
  var rafId = null;
  var lastDisplayedSecond = -1;
  var lastDisplayedDuration = -1;
  var isPlaying = false;
  var lastTickTime = 0;

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
    if (
      sec === lastDisplayedSecond &&
      dur === lastDisplayedDuration &&
      t == null
    ) {
      return;
    }
    lastDisplayedSecond = sec;
    lastDisplayedDuration = dur;
    timeDisplayEl.textContent = formatTime(cur) + " / " + formatTime(dur);
  }

  function refreshDuration() {
    lastDisplayedDuration = -1;
    updatePlayhead();
  }

  function updatePlayhead() {
    var t = getCurrentTime ? getCurrentTime() : 0;
    updatePlayheadPosition(t);
    updateTimeDisplay(t);
  }

  function tick(now) {
    if (!isPlaying) {
      stopRaf();
      return;
    }
    if (!lastTickTime) lastTickTime = now;
    var dt = (now - lastTickTime) / 1000;
    lastTickTime = now;
    var t = (getCurrentTime ? getCurrentTime() : 0) + dt;
    var dur = getDuration ? getDuration() : 0;
    if (t >= dur) {
      t = dur;
      isPlaying = false;
      updatePlayPauseButton();
      stopRaf();
      if (onPlayStateChange) onPlayStateChange(false);
    }
    if (setCurrentTime) setCurrentTime(t, { silent: true });
    updatePlayheadPosition(t);
    updateTimeDisplay(t);
    if (onTimeUpdate) onTimeUpdate(t);
    if (isPlaying) rafId = requestAnimationFrame(tick);
  }

  function startRaf() {
    stopRaf();
    lastTickTime = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stopRaf() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastTickTime = 0;
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
    if (isPlaying) startRaf();
  }

  function updatePlayPauseButton() {
    if (!playPauseBtn) return;
    playPauseBtn.textContent = isPlaying ? "⏸ Pause" : "▶ Play";
    playPauseBtn.title = isPlaying ? "Pause" : "Play";
    playPauseBtn.setAttribute("aria-pressed", isPlaying ? "true" : "false");
  }

  function play() {
    var dur = getDuration ? getDuration() : 0;
    if (!dur) return;
    var t = getCurrentTime ? getCurrentTime() : 0;
    if (t >= dur) {
      if (setCurrentTime) setCurrentTime(0, { silent: true });
      updatePlayhead();
      if (onTimeUpdate) onTimeUpdate(0);
    }
    isPlaying = true;
    updatePlayPauseButton();
    if (onPlayStateChange) onPlayStateChange(true);
    startRaf();
  }

  function pause() {
    isPlaying = false;
    stopRaf();
    updatePlayPauseButton();
    updatePlayhead();
    if (onPlayStateChange) onPlayStateChange(false);
  }

  function togglePlayPause() {
    if (isPlaying) pause();
    else play();
  }

  function init(opts) {
    timelineEl = opts.timelineEl;
    playheadEl = opts.playheadEl;
    timeDisplayEl = opts.timeDisplayEl;
    playPauseBtn = opts.playPauseBtn;
    getDuration = opts.getDuration;
    getCurrentTime = opts.getCurrentTime;
    setCurrentTime = opts.setCurrentTime;
    onTimeUpdate = opts.onTimeUpdate;
    onPlayStateChange = opts.onPlayStateChange;

    if (timelineEl) {
      timelineEl.addEventListener("pointerdown", onPointerDown);
      timelineEl.addEventListener("pointermove", onPointerMove);
      timelineEl.addEventListener("pointerup", onPointerUp);
      timelineEl.addEventListener("pointercancel", onPointerUp);
    }
    updatePlayPauseButton();
  }

  window.EditorTimeline = {
    init: init,
    updatePlayhead: updatePlayhead,
    updateTimeDisplay: updateTimeDisplay,
    refreshDuration: refreshDuration,
    play: play,
    pause: pause,
    togglePlayPause: togglePlayPause,
    updatePlayPauseButton: updatePlayPauseButton,
    isPlaying: function () {
      return isPlaying;
    },
    timeToPct: timeToPct,
    pctToTime: pctToTime,
    formatTime: formatTime,
  };
})();
