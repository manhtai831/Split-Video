(function () {
  "use strict";

  var transformBox = null;
  var arrowHandles = null;
  var frameEl = null;
  var getSelectedLayer = null;
  var updateLayer = null;
  var onSelect = null;
  var onDeselect = null;
  var isDrawToolActive = null;
  var onInteractionEnd = null;

  var mode = null;
  var handle = null;
  var arrowHandle = null;
  var startPointer = { x: 0, y: 0 };
  var startLayer = null;
  var startAspect = 1;
  var startAngle = 0;
  var startRotation = 0;

  var CORNER_HANDLES = { nw: true, ne: true, se: true, sw: true };
  var EDGE_HANDLES = { n: true, e: true, s: true, w: true };
  var DRAG_THRESHOLD_PX = 4;
  var interactionMoved = false;
  var snapGuidesEl = null;
  var activeSnapState = { x: null, y: null };
  var activeResizeSnapState = {
    left: null,
    right: null,
    top: null,
    bottom: null,
  };
  var snapGuideHideTimer = null;

  function pointerMovedEnough(e) {
    return (
      Math.hypot(e.clientX - startPointer.x, e.clientY - startPointer.y) >
      DRAG_THRESHOLD_PX
    );
  }

  function resetSnapState() {
    activeSnapState = { x: null, y: null };
  }

  function resetResizeSnapState() {
    activeResizeSnapState = {
      left: null,
      right: null,
      top: null,
      bottom: null,
    };
  }

  function finishInteraction() {
    hideSnapGuides();
    resetSnapState();
    resetResizeSnapState();
    if (interactionMoved) {
      if (onInteractionEnd) onInteractionEnd();
      if (typeof window.EditorApp !== "undefined") {
        window.EditorApp.refreshUI();
      }
    }
    interactionMoved = false;
    mode = null;
    handle = null;
    arrowHandle = null;
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

  function isArrowLayer(layer) {
    if (window.EditorDraw && window.EditorDraw.isArrowLayer) {
      return window.EditorDraw.isArrowLayer(layer);
    }
    return !!(layer && layer.kind === "shape" && layer.shape === "arrow");
  }

  function withArrowEndpoints(layer) {
    if (!isArrowLayer(layer)) return layer;
    if (window.EditorDraw && window.EditorDraw.ensureArrowEndpoints) {
      return window.EditorDraw.ensureArrowEndpoints(layer);
    }
    return layer;
  }

  function syncArrowLayer(layer) {
    if (!isArrowLayer(layer)) return layer;
    if (window.EditorDraw && window.EditorDraw.syncArrowBBox) {
      return window.EditorDraw.syncArrowBBox(withArrowEndpoints(layer));
    }
    return layer;
  }

  function getLayerCenter(layer) {
    return {
      cx: layer.x + layer.width / 2,
      cy: layer.y + layer.height / 2,
    };
  }

  function wantsSquareResize(layer) {
    if (!layer) return false;
    if (layer.kind === "blur" || layer.kind === "text") return true;
    return layer.kind === "shape" && layer.shape !== "arrow";
  }

  function squareNormAspect() {
    var rect =
      window.EditorFrame && window.EditorFrame.getFrameRect
        ? window.EditorFrame.getFrameRect()
        : null;
    if (!rect || !rect.width || !rect.height) return 1;
    return rect.height / rect.width;
  }

  function applyResize(layer, dx, dy, h, shiftKey) {
    var min = window.EditorFrame.MIN_LAYER_SIZE;
    var max = window.EditorFrame.MAX_LAYER_OVERFLOW;
    var sl = startLayer;
    var anchorR = sl.x + sl.width;
    var anchorB = sl.y + sl.height;
    var x;
    var y;
    var w;
    var hgt;

    function clampW(val) {
      return Math.max(min, Math.min(val, max));
    }

    function clampH(val) {
      return Math.max(min, Math.min(val, max));
    }

    if (CORNER_HANDLES[h]) {
      var anchorX = h.indexOf("w") >= 0 ? anchorR : sl.x;
      var anchorY = h.indexOf("n") >= 0 ? anchorB : sl.y;

      if (h === "se") {
        x = sl.x;
        y = sl.y;
        w = clampW(sl.width + dx);
        hgt = clampH(sl.height + dy);
      } else if (h === "nw") {
        x = sl.x + dx;
        y = sl.y + dy;
        w = clampW(anchorR - x);
        hgt = clampH(anchorB - y);
      } else if (h === "ne") {
        x = sl.x;
        y = sl.y + dy;
        w = clampW(sl.width + dx);
        hgt = clampH(anchorB - y);
      } else if (h === "sw") {
        x = sl.x + dx;
        y = sl.y;
        w = clampW(anchorR - x);
        hgt = clampH(sl.height + dy);
      }

      if (shiftKey) {
        var aspect = wantsSquareResize(layer) ? squareNormAspect() : startAspect;
        if (w / hgt > aspect) {
          hgt = w / aspect;
          if (h.indexOf("n") >= 0) y = anchorY - hgt;
          else y = sl.y;
        } else {
          w = hgt * aspect;
          if (h.indexOf("w") >= 0) x = anchorX - w;
          else x = sl.x;
        }
        w = clampW(w);
        hgt = clampH(hgt);
        if (h.indexOf("w") >= 0) {
          x = anchorR - w;
          w = anchorR - x;
        } else {
          x = sl.x;
        }
        if (h.indexOf("n") >= 0) {
          y = anchorB - hgt;
          hgt = anchorB - y;
        } else {
          y = sl.y;
        }
      }
    } else if (EDGE_HANDLES[h]) {
      x = sl.x;
      y = sl.y;
      w = sl.width;
      hgt = sl.height;

      if (h === "e") {
        w = clampW(sl.width + dx);
      } else if (h === "w") {
        x = sl.x + dx;
        w = clampW(anchorR - x);
      } else if (h === "s") {
        hgt = clampH(sl.height + dy);
      } else if (h === "n") {
        y = sl.y + dy;
        hgt = clampH(anchorB - y);
      }
    } else {
      return layer;
    }

    return window.EditorFrame.clampLayer(
      Object.assign({}, layer, { x: x, y: y, width: w, height: hgt })
    );
  }

  function hideArrowHandles() {
    if (arrowHandles) arrowHandles.hidden = true;
  }

  function showArrowHandles(layer) {
    if (!arrowHandles) return;
    var ready = withArrowEndpoints(layer);
    var startEl = arrowHandles.querySelector('[data-arrow-handle="start"]');
    var endEl = arrowHandles.querySelector('[data-arrow-handle="end"]');
    if (startEl) {
      startEl.style.left = ready.x1 * 100 + "%";
      startEl.style.top = ready.y1 * 100 + "%";
    }
    if (endEl) {
      endEl.style.left = ready.x2 * 100 + "%";
      endEl.style.top = ready.y2 * 100 + "%";
    }
    arrowHandles.hidden = false;
  }

  function syncTransformBox(layer) {
    if (!layer) {
      if (transformBox) transformBox.hidden = true;
      hideArrowHandles();
      return;
    }
    if (isArrowLayer(layer)) {
      if (transformBox) transformBox.hidden = true;
      showArrowHandles(layer);
      return;
    }
    hideArrowHandles();
    if (!transformBox) return;
    transformBox.hidden = false;
    transformBox.style.left = layer.x * 100 + "%";
    transformBox.style.top = layer.y * 100 + "%";
    transformBox.style.width = layer.width * 100 + "%";
    transformBox.style.height = layer.height * 100 + "%";
    transformBox.style.transform = "rotate(" + (layer.rotation || 0) + "deg)";
  }

  function ensureSnapGuides() {
    if (snapGuidesEl || !frameEl) return;
    snapGuidesEl = document.createElement("div");
    snapGuidesEl.id = "editorSnapGuides";
    snapGuidesEl.className = "editor-snap-guides";
    snapGuidesEl.hidden = true;
    snapGuidesEl.innerHTML =
      '<div class="editor-snap-guide editor-snap-guide--v" data-axis="v"></div>' +
      '<div class="editor-snap-guide editor-snap-guide--h" data-axis="h"></div>';
    frameEl.appendChild(snapGuidesEl);
  }

  function showSnapGuides(guides) {
    if (snapGuideHideTimer) {
      clearTimeout(snapGuideHideTimer);
      snapGuideHideTimer = null;
    }
    ensureSnapGuides();
    if (!snapGuidesEl) return;
    var vGuide = snapGuidesEl.querySelector('[data-axis="v"]');
    var hGuide = snapGuidesEl.querySelector('[data-axis="h"]');
    var showV = guides && guides.v && guides.v.length;
    var showH = guides && guides.h && guides.h.length;
    if (!showV && !showH) {
      snapGuidesEl.hidden = true;
      return;
    }
    snapGuidesEl.hidden = false;
    if (vGuide) {
      vGuide.hidden = !showV;
      if (showV) vGuide.style.left = guides.v[0] * 100 + "%";
    }
    if (hGuide) {
      hGuide.hidden = !showH;
      if (showH) hGuide.style.top = guides.h[0] * 100 + "%";
    }
  }

  function hideSnapGuides() {
    if (snapGuideHideTimer) {
      clearTimeout(snapGuideHideTimer);
      snapGuideHideTimer = null;
    }
    if (snapGuidesEl) snapGuidesEl.hidden = true;
  }

  function scheduleHideSnapGuides(delayMs) {
    if (snapGuideHideTimer) clearTimeout(snapGuideHideTimer);
    snapGuideHideTimer = setTimeout(function () {
      snapGuideHideTimer = null;
      hideSnapGuides();
    }, delayMs || 700);
  }

  function applyArrowTranslate(start, dx, dy) {
    var ready = withArrowEndpoints(start);
    var next = syncArrowLayer(
      Object.assign({}, ready, {
        x1: ready.x1 + dx,
        y1: ready.y1 + dy,
        x2: ready.x2 + dx,
        y2: ready.y2 + dy,
      })
    );
    var result = window.EditorFrame.moveLayerSnapped(
      next,
      next.x,
      next.y,
      activeSnapState
    );
    activeSnapState = result.snapState;
    var snapDx = result.layer.x - next.x;
    var snapDy = result.layer.y - next.y;
    if (snapDx || snapDy) {
      result.layer = syncArrowLayer(
        Object.assign({}, result.layer, {
          x1: next.x1 + snapDx,
          y1: next.y1 + snapDy,
          x2: next.x2 + snapDx,
          y2: next.y2 + snapDy,
        })
      );
    }
    return result;
  }

  function applyDragMove(layer, nx, ny) {
    var result;
    if (isArrowLayer(startLayer)) {
      var dx = nx - startLayer.x;
      var dy = ny - startLayer.y;
      result = applyArrowTranslate(startLayer, dx, dy);
      updateLayer(layer.id, result.layer, { live: true });
      showSnapGuides(result.guides);
      return;
    }
    result = window.EditorFrame.moveLayerSnapped(
      layer,
      nx,
      ny,
      activeSnapState
    );
    activeSnapState = result.snapState;
    updateLayer(layer.id, result.layer, { live: true });
    showSnapGuides(result.guides);
  }

  function nudgeLayer(layer, dxNorm, dyNorm) {
    if (isArrowLayer(layer)) {
      var ready = withArrowEndpoints(layer);
      var next = syncArrowLayer(
        Object.assign({}, ready, {
          x1: ready.x1 + dxNorm,
          y1: ready.y1 + dyNorm,
          x2: ready.x2 + dxNorm,
          y2: ready.y2 + dyNorm,
        })
      );
      next = window.EditorFrame.clampLayer(next);
      return {
        layer: next,
        guides: { v: [], h: [] },
        moved:
          next.x1 !== ready.x1 ||
          next.y1 !== ready.y1 ||
          next.x2 !== ready.x2 ||
          next.y2 !== ready.y2,
      };
    }
    var result = window.EditorFrame.nudgeLayerSnapped(layer, dxNorm, dyNorm);
    if (result.moved) {
      showSnapGuides(result.guides);
      scheduleHideSnapGuides();
    }
    return result;
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
    resetSnapState();
    resetResizeSnapState();

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
      applyDragMove(layer, startLayer.x + dx, startLayer.y + dy);
    } else if (mode === "resize") {
      var resized = applyResize(layer, dx, dy, handle, e.shiftKey);
      var snapped = window.EditorFrame.snapResizeLayer(
        resized,
        handle,
        activeResizeSnapState
      );
      activeResizeSnapState = snapped.snapState;
      updateLayer(layer.id, snapped.layer, { live: true });
      showSnapGuides(snapped.guides);
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

  function onArrowHandleDown(e) {
    var handleEl = e.target.closest("[data-arrow-handle]");
    if (!handleEl || !handleEl.closest("#editorArrowHandles")) return;

    var layer = getSelectedLayer();
    if (!layer || !isArrowLayer(layer)) return;

    e.preventDefault();
    e.stopPropagation();

    startPointer = { x: e.clientX, y: e.clientY };
    startLayer = Object.assign({}, withArrowEndpoints(layer));
    arrowHandle = handleEl.getAttribute("data-arrow-handle");
    mode = "arrow-endpoint";
    interactionMoved = false;
    resetSnapState();

    frameEl.setPointerCapture(e.pointerId);
    frameEl.addEventListener("pointermove", onArrowHandleMove);
    frameEl.addEventListener("pointerup", onArrowHandleUp);
    frameEl.addEventListener("pointercancel", onArrowHandleUp);
  }

  function onArrowHandleMove(e) {
    if (mode !== "arrow-endpoint" || !startLayer || !arrowHandle) return;
    interactionMoved = true;
    var rect = frameEl.getBoundingClientRect();
    var nx = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / rect.width)
    );
    var ny = Math.min(
      1,
      Math.max(0, (e.clientY - rect.top) / rect.height)
    );

    var x1 = startLayer.x1;
    var y1 = startLayer.y1;
    var x2 = startLayer.x2;
    var y2 = startLayer.y2;
    if (arrowHandle === "start") {
      x1 = nx;
      y1 = ny;
      if (e.shiftKey && window.EditorDraw && window.EditorDraw.snapArrowTip) {
        var snappedStart = window.EditorDraw.snapArrowTip(x2, y2, x1, y1);
        x1 = snappedStart.x;
        y1 = snappedStart.y;
      }
    } else {
      x2 = nx;
      y2 = ny;
      if (e.shiftKey && window.EditorDraw && window.EditorDraw.snapArrowTip) {
        var snappedEnd = window.EditorDraw.snapArrowTip(x1, y1, x2, y2);
        x2 = snappedEnd.x;
        y2 = snappedEnd.y;
      }
    }

    var next = syncArrowLayer(
      Object.assign({}, startLayer, {
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
      })
    );
    next = window.EditorFrame.clampLayer(next);
    updateLayer(startLayer.id, next, { live: true });
    syncTransformBox(getSelectedLayer());
  }

  function onArrowHandleUp(e) {
    releaseFramePointer(e, onArrowHandleMove, onArrowHandleUp);
    finishInteraction();
  }

  function onLayerPointerDown(e, layerId) {
    if (e.target.closest("#editorTransformBox")) return;
    if (e.target.closest("#editorArrowHandles")) return;
    if (isDrawToolActive && isDrawToolActive()) return;
    e.preventDefault();
    e.stopPropagation();

    if (onSelect) onSelect(layerId, { silent: true });

    var layer = getSelectedLayer();
    if (!layer) return;

    startPointer = { x: e.clientX, y: e.clientY };
    startLayer = Object.assign({}, withArrowEndpoints(layer));
    mode = "drag";
    interactionMoved = false;
    resetSnapState();

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
    applyDragMove(layer, startLayer.x + dx, startLayer.y + dy);
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
    if (e.target.closest("#editorArrowHandles")) return;
    if (onDeselect) onDeselect();
    syncTransformBox(null);
  }

  function init(opts) {
    frameEl = opts.frameEl;
    transformBox = opts.transformBox;
    arrowHandles = opts.arrowHandles || document.getElementById("editorArrowHandles");
    getSelectedLayer = opts.getSelectedLayer;
    updateLayer = opts.updateLayer;
    onSelect = opts.onSelect;
    onDeselect = opts.onDeselect;
    isDrawToolActive = opts.isDrawToolActive;
    onInteractionEnd = opts.onInteractionEnd || null;

    if (transformBox) {
      transformBox.addEventListener("pointerdown", onPointerDown);
    }
    if (arrowHandles) {
      arrowHandles.addEventListener("pointerdown", onArrowHandleDown);
    }
    if (frameEl) {
      frameEl.addEventListener("pointerdown", onFramePointerDown);
    }
  }

  window.EditorTransform = {
    init: init,
    syncTransformBox: syncTransformBox,
    onLayerPointerDown: onLayerPointerDown,
    nudgeLayer: nudgeLayer,
  };
})();
