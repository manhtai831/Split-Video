(function () {
  "use strict";

  var transformBox = null;
  var frameEl = null;
  var getSelectedLayer = null;
  var updateLayer = null;
  var onSelect = null;
  var onDeselect = null;
  var isDrawToolActive = null;

  var mode = null;
  var handle = null;
  var startPointer = { x: 0, y: 0 };
  var startLayer = null;
  var startAspect = 1;
  var startAngle = 0;
  var startRotation = 0;

  var CORNER_HANDLES = { nw: true, ne: true, se: true, sw: true };
  var EDGE_HANDLES = { n: true, e: true, s: true, w: true };
  var DRAG_THRESHOLD_PX = 4;
  var interactionMoved = false;

  function pointerMovedEnough(e) {
    return (
      Math.hypot(e.clientX - startPointer.x, e.clientY - startPointer.y) >
      DRAG_THRESHOLD_PX
    );
  }

  function finishInteraction() {
    if (interactionMoved && typeof window.EditorApp !== "undefined") {
      window.EditorApp.refreshUI();
    }
    interactionMoved = false;
    mode = null;
    handle = null;
    startLayer = null;
  }

  function releaseFramePointer(e, moveHandler, upHandler) {
    if (!frameEl) return;
    try {
      frameEl.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* already released */
    }
    frameEl.removeEventListener("pointermove", moveHandler);
    frameEl.removeEventListener("pointerup", upHandler);
    frameEl.removeEventListener("pointercancel", upHandler);
  }

  function getLayerCenter(layer) {
    return {
      cx: layer.x + layer.width / 2,
      cy: layer.y + layer.height / 2,
    };
  }

  function applyResize(layer, dx, dy, h, shiftKey) {
    var min = window.EditorFrame.MIN_LAYER_SIZE;
    var sl = startLayer;
    var anchorR = sl.x + sl.width;
    var anchorB = sl.y + sl.height;
    var overflow = layer.id === "__video__";
    var x;
    var y;
    var w;
    var hgt;

    function clampW(val, left) {
      if (overflow) return Math.max(min, val);
      return Math.max(min, Math.min(val, 1 - left));
    }

    function clampH(val, top) {
      if (overflow) return Math.max(min, val);
      return Math.max(min, Math.min(val, 1 - top));
    }

    function clampX(val, maxX) {
      if (overflow) return val;
      return Math.max(0, Math.min(val, maxX));
    }

    function clampY(val, maxY) {
      if (overflow) return val;
      return Math.max(0, Math.min(val, maxY));
    }

    if (CORNER_HANDLES[h]) {
      var anchorX = h.indexOf("w") >= 0 ? anchorR : sl.x;
      var anchorY = h.indexOf("n") >= 0 ? anchorB : sl.y;

      if (h === "se") {
        x = sl.x;
        y = sl.y;
        w = sl.width + dx;
        hgt = sl.height + dy;
        w = clampW(w, x);
        hgt = clampH(hgt, y);
      } else if (h === "nw") {
        x = sl.x + dx;
        y = sl.y + dy;
        x = clampX(x, anchorR - min);
        y = clampY(y, anchorB - min);
        w = anchorR - x;
        hgt = anchorB - y;
      } else if (h === "ne") {
        x = sl.x;
        y = sl.y + dy;
        w = sl.width + dx;
        y = clampY(y, anchorB - min);
        w = clampW(w, x);
        hgt = anchorB - y;
      } else if (h === "sw") {
        x = sl.x + dx;
        y = sl.y;
        x = clampX(x, anchorR - min);
        w = anchorR - x;
        hgt = sl.height + dy;
        hgt = clampH(hgt, y);
      }

      if (shiftKey) {
        var aspect = startAspect;
        if (w / hgt > aspect) {
          hgt = w / aspect;
          if (h.indexOf("n") >= 0) y = anchorY - hgt;
          else y = sl.y;
        } else {
          w = hgt * aspect;
          if (h.indexOf("w") >= 0) x = anchorX - w;
          else x = sl.x;
        }
        w = Math.max(min, w);
        hgt = Math.max(min, hgt);
        if (h.indexOf("w") >= 0) {
          x = anchorR - w;
          if (!overflow) x = Math.max(0, x);
          w = anchorR - x;
        } else {
          x = sl.x;
          if (!overflow) w = Math.min(w, 1 - x);
        }
        if (h.indexOf("n") >= 0) {
          y = anchorB - hgt;
          if (!overflow) y = Math.max(0, y);
          hgt = anchorB - y;
        } else {
          y = sl.y;
          if (!overflow) hgt = Math.min(hgt, 1 - y);
        }
      }
    } else if (EDGE_HANDLES[h]) {
      x = sl.x;
      y = sl.y;
      w = sl.width;
      hgt = sl.height;

      if (h === "e") {
        w = clampW(sl.width + dx, sl.x);
      } else if (h === "w") {
        x = sl.x + dx;
        x = clampX(x, anchorR - min);
        w = anchorR - x;
      } else if (h === "s") {
        hgt = clampH(sl.height + dy, sl.y);
      } else if (h === "n") {
        y = sl.y + dy;
        y = clampY(y, anchorB - min);
        hgt = anchorB - y;
      }
    } else {
      return layer;
    }

    var clampFn =
      layer.id === "__video__"
        ? window.EditorFrame.clampVideoTransform
        : window.EditorFrame.clampLayer;
    return clampFn(
      Object.assign({}, layer, { x: x, y: y, width: w, height: hgt })
    );
  }

  function syncTransformBox(layer) {
    if (!transformBox || !layer) {
      if (transformBox) transformBox.hidden = true;
      return;
    }
    transformBox.hidden = false;
    transformBox.style.left = layer.x * 100 + "%";
    transformBox.style.top = layer.y * 100 + "%";
    transformBox.style.width = layer.width * 100 + "%";
    transformBox.style.height = layer.height * 100 + "%";
    transformBox.style.transform = "rotate(" + (layer.rotation || 0) + "deg)";
  }

  function syncTransformBoxForVideo() {
    var layer = getSelectedLayer ? getSelectedLayer() : null;
    if (layer && layer.id === "__video__") {
      syncTransformBox(layer);
    } else {
      syncTransformBox(null);
    }
  }

  function onPointerDown(e) {
    var target = e.target;
    var handleEl = target.closest("[data-handle]");
    if (!handleEl || !handleEl.closest("#editorTransformBox")) return;

    var layer = getSelectedLayer();
    if (!layer) return;

    e.preventDefault();
    e.stopPropagation();

    startPointer = { x: e.clientX, y: e.clientY };
    startLayer = Object.assign({}, layer);
    startAspect = startLayer.width / startLayer.height;
    startRotation = startLayer.rotation || 0;
    interactionMoved = false;

    var h = handleEl.getAttribute("data-handle");
    if (h === "drag") {
      mode = "drag";
    } else if (h.indexOf("rotate") === 0) {
      mode = "rotate";
      var center = getLayerCenter(startLayer);
      var rect = frameEl.getBoundingClientRect();
      var cx = rect.left + center.cx * rect.width;
      var cy = rect.top + center.cy * rect.height;
      startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    } else {
      mode = "resize";
      handle = h;
    }

    frameEl.setPointerCapture(e.pointerId);
    frameEl.addEventListener("pointermove", onPointerMove);
    frameEl.addEventListener("pointerup", onPointerUp);
    frameEl.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e) {
    var layer = getSelectedLayer();
    if (!layer || !startLayer) return;
    interactionMoved = true;

    var rect = frameEl.getBoundingClientRect();
    var dx = (e.clientX - startPointer.x) / rect.width;
    var dy = (e.clientY - startPointer.y) / rect.height;
    var clampFn =
      layer.id === "__video__"
        ? window.EditorFrame.clampVideoTransform
        : window.EditorFrame.clampLayer;

    if (mode === "drag") {
      var nx = startLayer.x + dx;
      var ny = startLayer.y + dy;
      if (layer.id === "__video__") {
        updateLayer(
          layer.id,
          window.EditorFrame.moveVideoTransform(layer, nx, ny),
          { live: true }
        );
      } else {
        updateLayer(
          layer.id,
          clampFn(Object.assign({}, layer, { x: nx, y: ny })),
          { live: true }
        );
      }
    } else if (mode === "resize") {
      var resized = applyResize(layer, dx, dy, handle, e.shiftKey);
      updateLayer(layer.id, resized, { live: true });
    } else if (mode === "rotate") {
      var center = getLayerCenter(startLayer);
      var cx = rect.left + center.cx * rect.width;
      var cy = rect.top + center.cy * rect.height;
      var angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      var deg = startRotation + ((angle - startAngle) * 180) / Math.PI;
      updateLayer(layer.id, { rotation: deg }, { live: true });
    }
    syncTransformBox(getSelectedLayer());
  }

  function onPointerUp(e) {
    releaseFramePointer(e, onPointerMove, onPointerUp);
    finishInteraction();
  }

  function onLayerPointerDown(e, layerId) {
    if (e.target.closest("#editorTransformBox")) return;
    if (isDrawToolActive && isDrawToolActive()) return;
    e.preventDefault();
    e.stopPropagation();

    if (onSelect) onSelect(layerId, { silent: true });

    var layer = getSelectedLayer();
    if (!layer) return;

    startPointer = { x: e.clientX, y: e.clientY };
    startLayer = Object.assign({}, layer);
    mode = "drag";
    interactionMoved = false;

    frameEl.setPointerCapture(e.pointerId);
    frameEl.addEventListener("pointermove", onLayerPointerMove);
    frameEl.addEventListener("pointerup", onLayerPointerUp);
    frameEl.addEventListener("pointercancel", onLayerPointerUp);
  }

  function onLayerPointerMove(e) {
    if (mode !== "drag" || !startLayer) return;
    if (pointerMovedEnough(e)) interactionMoved = true;
    var layer = getSelectedLayer();
    if (!layer) return;
    var rect = frameEl.getBoundingClientRect();
    var dx = (e.clientX - startPointer.x) / rect.width;
    var dy = (e.clientY - startPointer.y) / rect.height;
    var clampFn =
      layer.id === "__video__"
        ? window.EditorFrame.clampVideoTransform
        : window.EditorFrame.clampLayer;
    updateLayer(
      layer.id,
      layer.id === "__video__"
        ? window.EditorFrame.moveVideoTransform(
            layer,
            startLayer.x + dx,
            startLayer.y + dy
          )
        : clampFn(
            Object.assign({}, layer, {
              x: startLayer.x + dx,
              y: startLayer.y + dy,
            })
          ),
      { live: true }
    );
    syncTransformBox(getSelectedLayer());
  }

  function onLayerPointerUp(e) {
    releaseFramePointer(e, onLayerPointerMove, onLayerPointerUp);
    finishInteraction();
  }

  function onFramePointerDown(e) {
    if (isDrawToolActive && isDrawToolActive()) {
      if (window.EditorDraw && window.EditorDraw.onFramePointerDown) {
        window.EditorDraw.onFramePointerDown(e);
      }
      return;
    }
    if (e.target.closest(".editor-layer")) return;
    if (e.target.closest("#editorTransformBox")) return;
    if (e.target.closest("#editorVideoLayer")) {
      if (onSelect) onSelect("__video__", { silent: true });
      syncTransformBox(getSelectedLayer());
      return;
    }
    if (onDeselect) onDeselect();
    syncTransformBox(null);
  }

  function init(opts) {
    frameEl = opts.frameEl;
    transformBox = opts.transformBox;
    getSelectedLayer = opts.getSelectedLayer;
    updateLayer = opts.updateLayer;
    onSelect = opts.onSelect;
    onDeselect = opts.onDeselect;
    isDrawToolActive = opts.isDrawToolActive;

    if (transformBox) {
      transformBox.addEventListener("pointerdown", onPointerDown);
    }
    if (frameEl) {
      frameEl.addEventListener("pointerdown", onFramePointerDown);
    }
  }

  window.EditorTransform = {
    init: init,
    syncTransformBox: syncTransformBox,
    syncTransformBoxForVideo: syncTransformBoxForVideo,
    onLayerPointerDown: onLayerPointerDown,
  };
})();
