(function () {
  "use strict";

  var segments = [];
  var activeSegmentId = null;
  var nextId = 1;

  function $(id) {
    return document.getElementById(id);
  }

  function formatTime(seconds) {
    if (!isFinite(seconds)) return "0:00";
    var total = Math.round(seconds * 10) / 10;
    var m = Math.floor(total / 60);
    var s = total % 60;
    if (m > 0) {
      return m + ":" + String(Math.floor(s)).padStart(2, "0");
    }
    return s.toFixed(1) + "s";
  }

  function uuid() {
    return "seg-" + nextId++;
  }

  function getVideoDuration() {
    if (typeof window.getGifVideoMeta === "function") {
      return window.getGifVideoMeta().duration || 0;
    }
    return 0;
  }

  function validateSegment(seg, excludeId) {
    if (!seg || seg.duration <= 0) {
      alert("Thời lượng đoạn phải lớn hơn 0.");
      return false;
    }
    if (seg.duration > 30) {
      alert("Mỗi đoạn tối đa 30 giây.");
      return false;
    }
    var videoDur = getVideoDuration();
    if (videoDur > 0 && seg.start_at + seg.duration > videoDur + 0.05) {
      alert("Đoạn vượt quá thời lượng video.");
      return false;
    }
    for (var i = 0; i < segments.length; i++) {
      var other = segments[i];
      if (excludeId && other.id === excludeId) continue;
      var a0 = seg.start_at;
      var a1 = seg.start_at + seg.duration;
      var b0 = other.start_at;
      var b1 = other.start_at + other.duration;
      if (a0 < b1 && a1 > b0) {
        alert("Đoạn bị trùng với đoạn khác.");
        return false;
      }
    }
    return true;
  }

  function renderSegmentList() {
    var list = $("gifSegmentsList");
    var section = $("gifSegmentsSection");
    var updateBtn = $("gifUpdateSegment");
    if (!list) return;

    list.innerHTML = "";

    if (segments.length === 0) {
      if (section) section.hidden = true;
      if (updateBtn) updateBtn.hidden = true;
      return;
    }

    if (section) section.hidden = false;
    if (updateBtn) updateBtn.hidden = !activeSegmentId;

    segments.forEach(function (seg, idx) {
      var li = document.createElement("li");
      li.className = "gif-segments-list__item";
      if (seg.id === activeSegmentId) {
        li.classList.add("gif-segments-list__item--active");
      }
      li.dataset.id = seg.id;

      var label = document.createElement("span");
      label.className = "gif-segments-list__label";
      label.textContent =
        "Đoạn " +
        (idx + 1) +
        " · " +
        formatTime(seg.start_at) +
        " → " +
        formatTime(seg.start_at + seg.duration) +
        " (" +
        formatTime(seg.duration) +
        ")";

      var actions = document.createElement("span");
      actions.className = "gif-segments-list__actions";

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--ghost btn--sm";
      delBtn.textContent = "×";
      delBtn.setAttribute("aria-label", "Xóa đoạn " + (idx + 1));
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        removeSegment(seg.id);
      });

      actions.appendChild(delBtn);
      li.appendChild(label);
      li.appendChild(actions);

      li.addEventListener("click", function () {
        selectSegment(seg.id);
      });

      list.appendChild(li);
    });

    syncHiddenField();
    if (typeof window.onGifSegmentsChanged === "function") {
      window.onGifSegmentsChanged(segments);
    }
  }

  function syncHiddenField() {
    var hidden = $("segmentsJson");
    if (!hidden) return;
    var payload = segments.map(function (s) {
      return { start_at: s.start_at, duration: s.duration };
    });
    hidden.value = JSON.stringify(payload);
  }

  function selectSegment(id) {
    activeSegmentId = id;
    var seg = segments.find(function (s) {
      return s.id === id;
    });
    if (!seg) return;
    if (typeof window.fillGifEditor === "function") {
      window.fillGifEditor(seg.start_at, seg.duration);
    }
    renderSegmentList();
  }

  function addSegment() {
    var draft =
      typeof window.readGifEditor === "function"
        ? window.readGifEditor()
        : null;
    if (!draft) return;
    if (!validateSegment(draft)) return;

    segments.push({
      id: uuid(),
      start_at: draft.start_at,
      duration: draft.duration,
    });
    activeSegmentId = null;
    if (typeof window.clearGifEditor === "function") {
      var last = segments[segments.length - 1];
      var nextStart = last.start_at + last.duration;
      var videoDur = getVideoDuration();
      var dur = Math.min(5, 30, videoDur > 0 ? videoDur - nextStart : 5);
      if (dur > 0.1) {
        window.fillGifEditor(nextStart, dur);
      } else {
        window.clearGifEditor();
      }
    }
    renderSegmentList();
  }

  function updateSegment() {
    if (!activeSegmentId) return;
    var draft =
      typeof window.readGifEditor === "function"
        ? window.readGifEditor()
        : null;
    if (!draft || !validateSegment(draft, activeSegmentId)) return;

    var seg = segments.find(function (s) {
      return s.id === activeSegmentId;
    });
    if (seg) {
      seg.start_at = draft.start_at;
      seg.duration = draft.duration;
    }
    renderSegmentList();
  }

  function removeSegment(id) {
    segments = segments.filter(function (s) {
      return s.id !== id;
    });
    if (activeSegmentId === id) {
      activeSegmentId = null;
      if (typeof window.clearGifEditor === "function") {
        window.clearGifEditor();
      }
    }
    renderSegmentList();
  }

  function syncGifSegmentsForSubmit() {
    if (segments.length === 0) {
      var draft =
        typeof window.readGifEditor === "function"
          ? window.readGifEditor()
          : null;
      if (!draft || !validateSegment(draft)) {
        return false;
      }
      segments = [
        {
          id: uuid(),
          start_at: draft.start_at,
          duration: draft.duration,
        },
      ];
      syncHiddenField();
    }
    if (segments.length === 0) {
      alert("Cần ít nhất một đoạn video.");
      return false;
    }
    if (segments.length > 20) {
      alert("Tối đa 20 đoạn mỗi job.");
      return false;
    }
    syncHiddenField();
    return true;
  }

  function bindEvents() {
    var addBtn = $("gifAddSegment");
    var updateBtn = $("gifUpdateSegment");
    if (addBtn) addBtn.addEventListener("click", addSegment);
    if (updateBtn) updateBtn.addEventListener("click", updateSegment);
  }

  function initGifSegments() {
    bindEvents();
    window.syncGifSegmentsForSubmit = syncGifSegmentsForSubmit;
    window.getGifSegments = function () {
      return segments.slice();
    };
  }

  window.initGifSegments = initGifSegments;
})();
