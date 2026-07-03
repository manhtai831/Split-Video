(function () {
  "use strict";

  var transformBox = null;
  var frameEl = null;
  var getSelectedLayer = null;
  var updateLayer = null;
  var onSelect = null;
  var onDeselect = null;

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
    var x;
    var y;
    var w;
    var hgt;

    if (CORNER_HANDLES[h]) {
      var anchorX = h.indexOf("w") >= 0 ? anchorR : sl.x;
      var anchorY = h.indexOf("n") >= 0 ? anchorB : sl.y;

      if (h === "se") {
        x = sl.x;
        y = sl.y;
        w = sl.width + dx;
        hgt = sl.height + dy;
        w = Math.max(min, Math.min(w, 1 - x));
        hgt = Math.max(min, Math.min(hgt, 1 - y));
      } else if (h === "nw") {
        x = sl.x + dx;
        y = sl.y + dy;
        x = Math.max(0, Math.min(x, anchorR - min));
        y = Math.max(0, Math.min(y, anchorB - min));
        w = anchorR - x;
        hgt = anchorB - y;
      } else if (h === "ne") {
        x = sl.x;
        y = sl.y + dy;
        w = sl.width + dx;
        y = Math.max(0, Math.min(y, anchorB - min));
        w = Math.max(min, Math.min(w, 1 - x));
        hgt = anchorB - y;
      } else if (h === "sw") {
        x = sl.x + dx;
        y = sl.y;
        x = Math.max(0, Math.min(x, anchorR - min));
        w = anchorR - x;
        hgt = sl.height + dy;
        hgt = Math.max(min, Math.min(hgt, 1 - y));
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
          x = Math.max(0, x);
          w = anchorR - x;
        } else {
          x = sl.x;
          w = Math.min(w, 1 - x);
        }
        if (h.indexOf("n") >= 0) {
          y = anchorB - hgt;
          y = Math.max(0, y);
          hgt = anchorB - y;
        } else {
          y = sl.y;
          hgt = Math.min(hgt, 1 - y);
        }
      }
    } else if (EDGE_HANDLES[h]) {
      x = sl.x;
      y = sl.y;
      w = sl.width;
      hgt = sl.height;

      if (h === "e") {
        w = Math.max(min, Math.min(sl.width + dx, 1 - sl.x));
      } else if (h === "w") {
        x = sl.x + dx;
        x = Math.max(0, Math.min(x, anchorR - min));
        w = anchorR - x;
      } else if (h === "s") {
        hgt = Math.max(min, Math.min(sl.height + dy, 1 - sl.y));
      } else if (h === "n") {
        y = sl.y + dy;
        y = Math.max(0, Math.min(y, anchorB - min));
        hgt = anchorB - y;
      }
    } else {
      return layer;
    }

    return window.EditorFrame.clampLayer(
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

    if (mode === "drag") {
      var nx = startLayer.x + dx;
      var ny = startLayer.y + dy;
      updateLayer(
        layer.id,
        window.EditorFrame.clampLayer(
          Object.assign({}, layer, { x: nx, y: ny })
        ),
        { live: true }
      );
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
    updateLayer(
      layer.id,
      window.EditorFrame.clampLayer(
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
    if (e.target.closest(".editor-layer")) return;
    if (e.target.closest("#editorTransformBox")) return;
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
    onLayerPointerDown: onLayerPointerDown,
  };
})();
