(function () {
  "use strict";

  var PREFS_KEY = "youtubeDownloadPlayer.prefs";
  var LOOP_OFF = "off";
  var LOOP_ONE = "one";
  var LOOP_ALL = "all";
  var CONTINUE_MS = 2 * 60 * 60 * 1000;

  var ICON_PLAY =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polygon points="6 3 20 12 6 21 6 3"/>' +
    "</svg>";

  var ICON_PAUSE =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="14" y="4" width="4" height="16" rx="1"/>' +
    '<rect x="6" y="4" width="4" height="16" rx="1"/>' +
    "</svg>";

  var ICON_LOOP =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m17 2 4 4-4 4"/>' +
    '<path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
    '<path d="m7 22-4-4 4-4"/>' +
    '<path d="M21 13v2a4 4 0 0 1-4 4H3"/>' +
    "</svg>";

  var ICON_LOOP_ONE =
    '<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m17 2 4 4-4 4"/>' +
    '<path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
    '<path d="m7 22-4-4 4-4"/>' +
    '<path d="M21 13v2a4 4 0 0 1-4 4H3"/>' +
    '<path d="M11 10h1v4"/>' +
    "</svg>";

  var api = {
    getSelectedFormat: null,
    getSelectedItem: null,
    resolveFormat: null,
    streamUrl: null,
    downloadUrl: null,
    selectItemById: null,
    getItems: null,
    onPlayingChange: null,
  };

  var playlist = [];
  var playingItem = null;
  var loopMode = LOOP_OFF;
  var resolving = false;
  var continueTimer = null;
  var listeningActive = false;
  var awaitingContinue = false;
  var isMediaPlaying = false;
  var isSeeking = false;
  var seekPreviewTime = 0;
  var progressBound = false;

  function $(id) {
    return document.getElementById(id);
  }

  function readPrefs() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  function writePrefs(prefs) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* ignore */
    }
  }

  function setStatus(text, isError) {
    var el = $("ytPlayerStatus");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("yt-status--error", !!isError);
  }

  function updateLoopButton() {
    var btn = $("ytLoopBtn");
    if (!btn) return;
    var label = "Loop: Off";
    var icon = ICON_LOOP;
    if (loopMode === LOOP_ONE) {
      label = "Loop: One";
      icon = ICON_LOOP_ONE;
    } else if (loopMode === LOOP_ALL) {
      label = "Loop: All";
    }
    btn.innerHTML = icon;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("data-loop", loopMode);
    btn.classList.toggle("is-active", loopMode !== LOOP_OFF);
  }

  function cycleLoop() {
    if (loopMode === LOOP_OFF) loopMode = LOOP_ONE;
    else if (loopMode === LOOP_ONE) loopMode = LOOP_ALL;
    else loopMode = LOOP_OFF;
    var prefs = readPrefs();
    prefs.loop = loopMode;
    writePrefs(prefs);
    updateLoopButton();
  }

  function mediaHasSrc(el) {
    if (!el) return false;
    if (el.getAttribute("src")) return true;
    return !!(el.currentSrc && el.currentSrc.length);
  }

  function activeMedia() {
    var video = $("ytMediaVideo");
    var audio = $("ytMediaAudio");
    if (video && !video.hidden && mediaHasSrc(video)) return video;
    if (audio && mediaHasSrc(audio)) return audio;
    if (video && !video.hidden) return video;
    return video || audio;
  }

  function resetProgressUI() {
    isSeeking = false;
    seekPreviewTime = 0;
    var fill = $("ytProgressFill");
    var bubble = $("ytProgressBubble");
    var time = $("ytProgressTime");
    var track = $("ytProgressTrack");
    if (fill) fill.style.width = "0%";
    if (bubble) {
      bubble.hidden = true;
      bubble.textContent = "0:00";
      bubble.style.left = "0%";
    }
    if (time) time.textContent = "0:00 / 0:00";
    if (track) {
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "0");
      track.setAttribute("aria-valuenow", "0");
    }
  }

  function showProgress(show) {
    var progress = $("ytProgress");
    if (!progress) return;
    progress.hidden = !show;
    if (!show) resetProgressUI();
  }

  function getAudioDuration(audio) {
    if (!audio) return 0;
    var d = audio.duration;
    if (!isFinite(d) || d < 0) return 0;
    return d;
  }

  function setProgressVisual(ratio, timeSec, durationSec, updateLabel) {
    var fill = $("ytProgressFill");
    var track = $("ytProgressTrack");
    var time = $("ytProgressTime");
    var pct = Math.max(0, Math.min(100, (ratio || 0) * 100));
    if (fill) fill.style.width = pct + "%";
    if (track) {
      track.setAttribute("aria-valuemax", String(Math.floor(durationSec || 0)));
      track.setAttribute("aria-valuenow", String(Math.floor(timeSec || 0)));
    }
    if (updateLabel && time) {
      time.textContent = formatDuration(timeSec) + " / " + formatDuration(durationSec);
    }
  }

  function syncProgressFromMedia() {
    if (isSeeking) return;
    var audio = $("ytMediaAudio");
    if (!audio || !mediaHasSrc(audio)) return;
    var duration = getAudioDuration(audio);
    var current = audio.currentTime || 0;
    var ratio = duration > 0 ? current / duration : 0;
    setProgressVisual(ratio, current, duration, true);
  }

  function timeFromPointerEvent(e) {
    var track = $("ytProgressTrack");
    var audio = $("ytMediaAudio");
    if (!track || !audio) return 0;
    var duration = getAudioDuration(audio);
    if (duration <= 0) return 0;
    var rect = track.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var ratio = rect.width > 0 ? x / rect.width : 0;
    ratio = Math.max(0, Math.min(1, ratio));
    return ratio * duration;
  }

  function showBubbleAt(timeSec, durationSec) {
    var bubble = $("ytProgressBubble");
    var track = $("ytProgressTrack");
    if (!bubble || !track) return;
    var duration = durationSec || 0;
    var ratio = duration > 0 ? timeSec / duration : 0;
    ratio = Math.max(0, Math.min(1, ratio));
    bubble.hidden = false;
    bubble.textContent = formatDuration(timeSec);
    bubble.style.left = ratio * 100 + "%";
  }

  function hideBubble() {
    if (isSeeking) return;
    var bubble = $("ytProgressBubble");
    if (bubble) bubble.hidden = true;
  }

  function previewSeek(timeSec) {
    var audio = $("ytMediaAudio");
    var duration = getAudioDuration(audio);
    seekPreviewTime = Math.max(0, Math.min(timeSec, duration));
    var ratio = duration > 0 ? seekPreviewTime / duration : 0;
    setProgressVisual(ratio, seekPreviewTime, duration, true);
    showBubbleAt(seekPreviewTime, duration);
  }

  function commitSeek() {
    var audio = $("ytMediaAudio");
    if (audio && mediaHasSrc(audio) && isFinite(seekPreviewTime)) {
      try {
        audio.currentTime = seekPreviewTime;
      } catch (err) {
        /* ignore seek errors on unloaded media */
      }
    }
    isSeeking = false;
    hideBubble();
    syncProgressFromMedia();
  }

  function onProgressPointerDown(e) {
    var audio = $("ytMediaAudio");
    if (!audio || !mediaHasSrc(audio)) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    isSeeking = true;
    var track = $("ytProgressTrack");
    if (track && track.setPointerCapture && e.pointerId != null) {
      try {
        track.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
    previewSeek(timeFromPointerEvent(e));
  }

  function onProgressPointerMove(e) {
    var audio = $("ytMediaAudio");
    if (!audio || !mediaHasSrc(audio)) return;
    var duration = getAudioDuration(audio);
    var t = timeFromPointerEvent(e);
    if (isSeeking) {
      previewSeek(t);
      return;
    }
    showBubbleAt(t, duration);
  }

  function onProgressPointerUp(e) {
    if (!isSeeking) return;
    previewSeek(timeFromPointerEvent(e));
    commitSeek();
  }

  function onProgressPointerLeave() {
    hideBubble();
  }

  function onProgressKeyDown(e) {
    var audio = $("ytMediaAudio");
    if (!audio || !mediaHasSrc(audio)) return;
    var duration = getAudioDuration(audio);
    if (duration <= 0) return;
    var step = e.shiftKey ? 10 : 5;
    var next = audio.currentTime || 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      next = Math.max(0, next - step);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      next = Math.min(duration, next + step);
    } else if (e.key === "Home") {
      e.preventDefault();
      next = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      next = duration;
    } else {
      return;
    }
    audio.currentTime = next;
    syncProgressFromMedia();
  }

  function bindProgressEvents() {
    if (progressBound) return;
    var track = $("ytProgressTrack");
    if (!track) return;
    progressBound = true;
    track.addEventListener("pointerdown", onProgressPointerDown);
    track.addEventListener("pointermove", onProgressPointerMove);
    track.addEventListener("pointerup", onProgressPointerUp);
    track.addEventListener("pointercancel", onProgressPointerUp);
    track.addEventListener("pointerleave", onProgressPointerLeave);
    track.addEventListener("keydown", onProgressKeyDown);
  }

  function hideMedia() {
    var video = $("ytMediaVideo");
    var audio = $("ytMediaAudio");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.hidden = true;
    }
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.hidden = true;
    }
    showProgress(false);
  }

  function setPlayPauseLabel(playing) {
    var btn = $("ytPlayPauseBtn");
    if (btn) {
      var label = playing ? "Pause" : "Play";
      btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      btn.title = label;
      btn.setAttribute("aria-label", label);
    }
    isMediaPlaying = !!playing;
    syncPlayingIndicator();
  }

  function notifyPlayingChange() {
    if (api.onPlayingChange) {
      api.onPlayingChange(playingItem, isMediaPlaying);
    }
  }

  function syncPlayingIndicator() {
    notifyPlayingChange();
  }

  function renderPlayingMeta(item) {
    var title = $("ytPlayerTitle");
    var sub = $("ytPlayerSub");
    var thumb = $("ytPlayerThumb");
    if (title) title.textContent = item ? item.title || item.youtube_id : "Chưa phát bài nào";
    if (sub) {
      sub.textContent = item
        ? (item.channel || "—") + (item.duration ? " · " + formatDuration(item.duration) : "")
        : "—";
    }
    if (thumb) {
      if (item && item.thumbnail) {
        thumb.src = item.thumbnail;
        thumb.hidden = false;
      } else {
        thumb.removeAttribute("src");
        thumb.hidden = true;
      }
    }
  }

  function setPlayingItem(item) {
    playingItem = item || null;
    renderPlayingMeta(playingItem);
    notifyPlayingChange();
  }

  function clearPlayingItem() {
    playingItem = null;
    isMediaPlaying = false;
    renderPlayingMeta(null);
    notifyPlayingChange();
  }

  function getPlayingItem() {
    return playingItem;
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) {
      return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }
    return m + ":" + String(s).padStart(2, "0");
  }

  function setPlaylist(items) {
    playlist = items || [];
    if (playingItem) {
      var stillThere = false;
      for (var i = 0; i < playlist.length; i++) {
        if (playlist[i].id === playingItem.id) {
          playingItem = playlist[i];
          stillThere = true;
          break;
        }
      }
      if (!stillThere) {
        clearPlayingItem();
      } else {
        renderPlayingMeta(playingItem);
      }
    }
  }

  function playingIndex() {
    if (!playingItem) return -1;
    for (var i = 0; i < playlist.length; i++) {
      if (playlist[i].id === playingItem.id) return i;
    }
    return -1;
  }

  function clearContinueTimer() {
    if (continueTimer) {
      clearTimeout(continueTimer);
      continueTimer = null;
    }
  }

  function hideContinuePrompt() {
    var prompt = $("ytContinuePrompt");
    if (prompt) prompt.hidden = true;
    awaitingContinue = false;
  }

  function showContinuePrompt() {
    var el = activeMedia();
    if (el && !el.paused) {
      el.pause();
      setPlayPauseLabel(false);
    }
    awaitingContinue = true;
    var prompt = $("ytContinuePrompt");
    if (prompt) {
      prompt.hidden = false;
      setStatus("", false);
      return;
    }
    var ok = window.confirm("Bạn đã nghe khoảng 2 giờ. Tiếp tục phát?");
    if (ok) {
      confirmContinueListening(true);
    } else {
      confirmContinueListening(false);
    }
  }

  function startContinueTimer(forceReset) {
    if (listeningActive && continueTimer && !forceReset) {
      return;
    }
    clearContinueTimer();
    listeningActive = true;
    continueTimer = setTimeout(function () {
      continueTimer = null;
      if (!listeningActive) return;
      showContinuePrompt();
    }, CONTINUE_MS);
  }

  function stopListeningSession() {
    listeningActive = false;
    clearContinueTimer();
    hideContinuePrompt();
  }

  function confirmContinueListening(yes) {
    hideContinuePrompt();
    if (!yes) {
      stopListeningSession();
      var el = activeMedia();
      if (el) {
        el.pause();
        setPlayPauseLabel(false);
      }
      setStatus("Đã dừng theo yêu cầu.", false);
      return;
    }
    startContinueTimer(true);
    var media = activeMedia();
    if (media && media.src) {
      media.play().then(
        function () {
          setPlayPauseLabel(true);
          setStatus("", false);
        },
        function (err) {
          setStatus(err.message || "Không phát được", true);
        }
      );
    }
  }

  function goRelative(delta, autoPlay) {
    if (!playlist.length) return Promise.resolve();
    var idx = playingIndex();
    if (idx < 0) {
      var selected = api.getSelectedItem ? api.getSelectedItem() : null;
      if (selected) {
        for (var i = 0; i < playlist.length; i++) {
          if (playlist[i].id === selected.id) {
            idx = i;
            break;
          }
        }
      }
    }
    if (idx < 0) idx = 0;
    else idx = (idx + delta + playlist.length) % playlist.length;
    var next = playlist[idx];
    if (!next) return Promise.resolve();
    setPlayingItem(next);
    if (!api.selectItemById) return Promise.resolve();
    return api.selectItemById(next.id, { autoPlay: !!autoPlay });
  }

  function playSelectedFormat() {
    if (awaitingContinue) return;
    if (!api.getSelectedFormat || !api.streamUrl) return;
    var format = api.getSelectedFormat();
    if (!format) {
      setStatus("Chọn một format trước khi phát.", true);
      return;
    }
    if (resolving) return;
    resolving = true;
    setStatus("Đang phát…", false);
    var itemToPlay = api.getSelectedItem ? api.getSelectedItem() : null;
    if (!itemToPlay || !itemToPlay.id) {
      resolving = false;
      setStatus("Chưa chọn video trong playlist.", true);
      return;
    }
    try {
      var src = api.streamUrl(itemToPlay.id, format.format_id);
      if (!src) throw new Error("Không có URL stream");
      hideMedia();
      var useAudio = format.kind === "audio";
      var el = useAudio ? $("ytMediaAudio") : $("ytMediaVideo");
      if (!el) throw new Error("Thiếu media element");
      setPlayingItem(itemToPlay);
      if (useAudio) {
        el.hidden = true;
        showProgress(true);
      } else {
        el.hidden = false;
        showProgress(false);
      }
      el.src = src;
      el.load();
      el.play().then(
        function () {
          setPlayPauseLabel(true);
          setStatus("", false);
          startContinueTimer(false);
          if (useAudio) syncProgressFromMedia();
        },
        function (err) {
          setPlayPauseLabel(false);
          setStatus(
            "Không phát được trong trình duyệt. Thử Mở / tải link. " +
              (err && err.message ? err.message : ""),
            true
          );
        }
      );
    } catch (err) {
      setStatus((err && err.message) || "Không phát được", true);
    } finally {
      resolving = false;
    }
  }

  function openSelectedLink() {
    if (!api.getSelectedFormat || !api.resolveFormat) return;
    var format = api.getSelectedFormat();
    if (!format) {
      setStatus("Chọn một format trước.", true);
      return;
    }
    setStatus("Đang lấy URL…", false);
    api
      .resolveFormat(format.format_id)
      .then(function (resolved) {
        if (!resolved || !resolved.url) throw new Error("Không có URL");
        setStatus("", false);
        window.open(resolved.url, "_blank", "noopener,noreferrer");
      })
      .catch(function (err) {
        setStatus(err.message || "Không lấy được URL", true);
      });
  }

  function downloadSelectedLink() {
    if (!api.getSelectedFormat || !api.downloadUrl || !api.getSelectedItem) return;
    var format = api.getSelectedFormat();
    if (!format) {
      setStatus("Chọn một format trước.", true);
      return;
    }
    var item = api.getSelectedItem();
    if (!item || !item.id) {
      setStatus("Chọn một video trước.", true);
      return;
    }
    var url = api.downloadUrl(item.id, format.format_id);
    if (!url) {
      setStatus("Không tạo được URL tải.", true);
      return;
    }
    setStatus("Đang tải xuống…", false);
    var a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus("", false);
  }

  function togglePlayPause() {
    if (awaitingContinue) return;
    var el = activeMedia();
    if (!el || !el.src) {
      playSelectedFormat();
      return;
    }
    if (el.paused) {
      el.play().then(
        function () {
          setPlayPauseLabel(true);
          startContinueTimer(false);
        },
        function (err) {
          setStatus(err.message || "Không phát được", true);
        }
      );
    } else {
      el.pause();
      setPlayPauseLabel(false);
    }
  }

  function onEnded() {
    setPlayPauseLabel(false);
    if (awaitingContinue) return;
    if (loopMode === LOOP_ONE) {
      var el = activeMedia();
      if (el) {
        el.currentTime = 0;
        el.play().then(
          function () {
            setPlayPauseLabel(true);
          },
          function () {}
        );
      }
      return;
    }
    if (loopMode === LOOP_ALL) {
      goRelative(1, true);
      return;
    }
    /* loop off: dừng */
  }

  function bindMediaEvents() {
    ["ytMediaVideo", "ytMediaAudio"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("play", function () {
        setPlayPauseLabel(true);
      });
      el.addEventListener("pause", function () {
        setPlayPauseLabel(false);
      });
      el.addEventListener("ended", onEnded);
    });
    var audio = $("ytMediaAudio");
    if (audio) {
      audio.addEventListener("timeupdate", syncProgressFromMedia);
      audio.addEventListener("loadedmetadata", syncProgressFromMedia);
      audio.addEventListener("durationchange", syncProgressFromMedia);
    }
  }

  function bindContinuePrompt() {
    var yesBtn = $("ytContinueYes");
    var noBtn = $("ytContinueNo");
    if (yesBtn) {
      yesBtn.addEventListener("click", function () {
        confirmContinueListening(true);
      });
    }
    if (noBtn) {
      noBtn.addEventListener("click", function () {
        confirmContinueListening(false);
      });
    }
  }

  function init(options) {
    api.getSelectedFormat = options && options.getSelectedFormat;
    api.getSelectedItem = options && options.getSelectedItem;
    api.resolveFormat = options && options.resolveFormat;
    api.streamUrl = options && options.streamUrl;
    api.downloadUrl = options && options.downloadUrl;
    api.selectItemById = options && options.selectItemById;
    api.getItems = options && options.getItems;
    api.onPlayingChange = options && options.onPlayingChange;

    var prefs = readPrefs();
    if (prefs.loop === LOOP_ONE || prefs.loop === LOOP_ALL || prefs.loop === LOOP_OFF) {
      loopMode = prefs.loop;
    }
    updateLoopButton();
    bindMediaEvents();
    bindProgressEvents();
    bindContinuePrompt();

    var prev = $("ytPrevBtn");
    var next = $("ytNextBtn");
    var playPause = $("ytPlayPauseBtn");
    var loopBtn = $("ytLoopBtn");
    if (prev) {
      prev.addEventListener("click", function () {
        var el = activeMedia();
        var shouldPlay = el && el.src && !el.paused;
        goRelative(-1, shouldPlay);
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        var el = activeMedia();
        var shouldPlay = el && el.src && !el.paused;
        goRelative(1, shouldPlay);
      });
    }
    if (playPause) playPause.addEventListener("click", togglePlayPause);
    if (loopBtn) loopBtn.addEventListener("click", cycleLoop);
  }

  window.YoutubeDownloadPlayer = {
    init: init,
    setPlaylist: setPlaylist,
    setPlayingItem: setPlayingItem,
    clearPlayingItem: clearPlayingItem,
    getPlayingItem: getPlayingItem,
    playSelectedFormat: playSelectedFormat,
    openSelectedLink: openSelectedLink,
    downloadSelectedLink: downloadSelectedLink,
    readPrefs: readPrefs,
    writePrefs: writePrefs,
  };
})();
