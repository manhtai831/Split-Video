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

  function $(id) {
    return document.getElementById(id);
  }

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

  function updatePlayhead() {
    if (!playheadEl) return;
    var t = getCurrentTime ? getCurrentTime() : 0;
    playheadEl.style.left = timeToPct(t) + "%";
    updateTimeDisplay();
  }

  function updateTimeDisplay() {
    if (!timeDisplayEl) return;
    var cur = getCurrentTime ? getCurrentTime() : 0;
    var dur = getDuration ? getDuration() : 0;
    timeDisplayEl.textContent = formatTime(cur) + " / " + formatTime(dur);
  }

  function seekFromEvent(e) {
    if (!timelineEl) return;
    var rect = timelineEl.getBoundingClientRect();
    var pct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    var t = pctToTime(pct);
    if (setCurrentTime) setCurrentTime(t);
    updatePlayhead();
    if (onTimeUpdate) onTimeUpdate(t);
  }

  function onPointerDown(e) {
    if (e.target.closest(".editor-caption-segment")) return;
    e.preventDefault();
    dragging = true;
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
      updatePlayhead();
      if (onTimeUpdate) onTimeUpdate(videoEl.currentTime);
    });
    videoEl.addEventListener("loadedmetadata", updateTimeDisplay);
    videoEl.addEventListener("play", updatePlayPauseButton);
    videoEl.addEventListener("pause", updatePlayPauseButton);
    videoEl.addEventListener("ended", updatePlayPauseButton);
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
