(function () {
  "use strict";

  var tracksEl = null;
  var getState = null;
  var getDuration = null;
  var updateLayer = null;
  var selectLayer = null;

  var dragging = null;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function isTimedLayer(layer) {
    if (layer.alwaysVisible) return false;
    return layer.start != null && layer.end != null;
  }

  function isLayerTimedVisible(layer, currentTime) {
    if (layer.alwaysVisible) return true;
    if (layer.start == null || layer.end == null) return true;
    return currentTime >= layer.start && currentTime < layer.end;
  }

  function segmentLabel(layer) {
    if (layer.kind === "text") {
      return layer.text && layer.text !== window.EditorLayers.TEXT_PLACEHOLDER
        ? layer.text
        : "Text";
    }
    if (layer.kind === "image") return "Image";
    if (layer.kind === "video") return "Video";
    return layer.kind;
  }

  function segmentClass(layer) {
    return (
      "editor-caption-segment editor-caption-segment--" +
      layer.kind +
      (getState().selectedId === layer.id ? " editor-caption-segment--selected" : "")
    );
  }

  function renderCaptionTracks() {
    if (!tracksEl || !getState) return;
    var state = getState();
    tracksEl.innerHTML = "";

    state.layers
      .filter(function (l) {
        return isTimedLayer(l);
      })
      .forEach(function (layer) {
        var seg = document.createElement("div");
        seg.className = segmentClass(layer);
        seg.dataset.layerId = layer.id;
        seg.style.left = window.EditorTimeline.timeToPct(layer.start) + "%";
        seg.style.width =
          window.EditorTimeline.timeToPct(layer.end - layer.start) + "%";
        var label = segmentLabel(layer);
        seg.title = label + " (" + layer.start.toFixed(1) + "s – " + layer.end.toFixed(1) + "s)";

        var thumbStart = document.createElement("div");
        thumbStart.className = "editor-caption-segment__thumb editor-caption-segment__thumb--start";
        thumbStart.dataset.thumb = "start";

        var thumbEnd = document.createElement("div");
        thumbEnd.className = "editor-caption-segment__thumb editor-caption-segment__thumb--end";
        thumbEnd.dataset.thumb = "end";

        seg.appendChild(thumbStart);
        seg.appendChild(thumbEnd);

        seg.addEventListener("pointerdown", function (e) {
          onSegmentPointerDown(e, layer);
        });

        tracksEl.appendChild(seg);
      });
  }

  function onSegmentPointerDown(e, layer) {
    e.preventDefault();
    e.stopPropagation();

    var thumb = e.target.dataset.thumb;
    var mode = thumb === "start" ? "start" : thumb === "end" ? "end" : "move";
    selectLayer(layer.id);

    dragging = {
      layerId: layer.id,
      mode: mode,
      startX: e.clientX,
      startStart: layer.start,
      startEnd: layer.end,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.addEventListener("pointermove", onSegmentPointerMove);
    e.currentTarget.addEventListener("pointerup", onSegmentPointerUp);
    e.currentTarget.addEventListener("pointercancel", onSegmentPointerUp);
  }

  function onSegmentPointerMove(e) {
    if (!dragging) return;
    var state = getState();
    var layer = state.layers.find(function (l) {
      return l.id === dragging.layerId;
    });
    if (!layer) return;

    var timeline = document.getElementById("editorTimeline");
    if (!timeline) return;
    var rect = timeline.getBoundingClientRect();
    var dur = getDuration ? getDuration() : 0;
    if (!dur) return;

    var dx = ((e.clientX - dragging.startX) / rect.width) * dur;
    var minLen = 0.1;
    var start = dragging.startStart;
    var end = dragging.startEnd;

    if (dragging.mode === "start") {
      start = clamp(dragging.startStart + dx, 0, end - minLen);
    } else if (dragging.mode === "end") {
      end = clamp(dragging.startEnd + dx, start + minLen, dur);
    } else {
      var len = end - start;
      start = clamp(dragging.startStart + dx, 0, dur - len);
      end = start + len;
    }

    var seg = e.currentTarget;
    seg.style.left = window.EditorTimeline.timeToPct(start) + "%";
    seg.style.width = window.EditorTimeline.timeToPct(end - start) + "%";
    dragging.pendingStart = start;
    dragging.pendingEnd = end;
  }

  function onSegmentPointerUp(e) {
    if (dragging && dragging.pendingStart !== undefined) {
      updateLayer(dragging.layerId, {
        start: dragging.pendingStart,
        end: dragging.pendingEnd,
      });
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.removeEventListener("pointermove", onSegmentPointerMove);
    e.currentTarget.removeEventListener("pointerup", onSegmentPointerUp);
    e.currentTarget.removeEventListener("pointercancel", onSegmentPointerUp);
    dragging = null;
  }

  function init(opts) {
    tracksEl = opts.tracksEl;
    getState = opts.getState;
    getDuration = opts.getDuration;
    updateLayer = opts.updateLayer;
    selectLayer = opts.selectLayer;
  }

  window.EditorCaptions = {
    init: init,
    renderCaptionTracks: renderCaptionTracks,
    isLayerTimedVisible: isLayerTimedVisible,
    isTimedLayer: isTimedLayer,
    isTextVisible: isLayerTimedVisible,
    isTimedText: isTimedLayer,
  };
})();
