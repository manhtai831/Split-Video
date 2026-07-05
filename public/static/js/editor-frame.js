(function () {
  "use strict";

  var MIN_LAYER_SIZE = 0.02;
  var MAX_LAYER_OVERFLOW = 4;
  var SNAP_THRESHOLD_PX = 4;
  var SNAP_RELEASE_THRESHOLD_PX = 4;
  var frameEl = null;
  var frameWidth = 1920;
  var frameHeight = 1080;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function getFrameRect() {
    if (!frameEl) return { width: 0, height: 0, left: 0, top: 0 };
    return frameEl.getBoundingClientRect();
  }

  function normToPx(x, y) {
    var rect = getFrameRect();
    return {
      x: x * rect.width,
      y: y * rect.height,
      width: rect.width,
      height: rect.height,
    };
  }

  function pxToNorm(px, py) {
    var rect = getFrameRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: px / rect.width,
      y: py / rect.height,
    };
  }

  function clampLayer(layer) {
    var w = clamp(layer.width, MIN_LAYER_SIZE, MAX_LAYER_OVERFLOW);
    var h = clamp(layer.height, MIN_LAYER_SIZE, MAX_LAYER_OVERFLOW);
    return Object.assign({}, layer, { x: layer.x, y: layer.y, width: w, height: h });
  }

  function moveLayer(layer, x, y) {
    return clampLayer(Object.assign({}, layer, { x: x, y: y }));
  }

  function snapEdgeCoord(coord, prevKey, axis, rect) {
    var span = axis === "x" ? rect.width : rect.height;
    if (!span) {
      return { value: coord, guide: null, key: null };
    }

    var threshold = SNAP_THRESHOLD_PX / span;
    var release = SNAP_RELEASE_THRESHOLD_PX / span;
    var targets = [
      { key: "min", pos: 0, guide: 0 },
      { key: "center", pos: 0.5, guide: 0.5 },
      { key: "max", pos: 1, guide: 1 },
    ];

    if (prevKey) {
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].key === prevKey) {
          if (Math.abs(coord - targets[i].pos) <= release) {
            return {
              value: targets[i].pos,
              guide: targets[i].guide,
              key: targets[i].key,
            };
          }
          break;
        }
      }
    }

    var best = null;
    for (var j = 0; j < targets.length; j++) {
      var dist = Math.abs(coord - targets[j].pos);
      if (dist <= threshold && (!best || dist < best.dist)) {
        best = {
          value: targets[j].pos,
          guide: targets[j].guide,
          key: targets[j].key,
          dist: dist,
        };
      }
    }
    if (best) {
      return { value: best.value, guide: best.guide, key: best.key };
    }
    return { value: coord, guide: null, key: null };
  }

  function detectLayerSnap(layer) {
    var align = { x: null, y: null };
    var rect = getFrameRect();
    if (!rect.width || !rect.height) return align;

    var epsX = 1 / rect.width;
    var epsY = 1 / rect.height;
    var w = layer.width;
    var h = layer.height;

    if (Math.abs(layer.x) <= epsX) align.x = "min";
    else if (Math.abs(layer.x + w - 1) <= epsX) align.x = "max";
    else if (Math.abs(layer.x + w / 2 - 0.5) <= epsX) align.x = "center";

    if (Math.abs(layer.y) <= epsY) align.y = "min";
    else if (Math.abs(layer.y + h - 1) <= epsY) align.y = "max";
    else if (Math.abs(layer.y + h / 2 - 0.5) <= epsY) align.y = "center";

    return align;
  }

  function snapResizeLayer(layer, handle, snapState) {
    var guides = { v: [], h: [] };
    var state = snapState || {
      left: null,
      right: null,
      top: null,
      bottom: null,
    };
    var rect = getFrameRect();
    if (!rect.width || !rect.height) {
      return { layer: layer, guides: guides, snapState: state };
    }

    var x = layer.x;
    var y = layer.y;
    var w = layer.width;
    var h = layer.height;
    var anchorR = x + w;
    var anchorB = y + h;
    var movesLeft = handle.indexOf("w") >= 0;
    var movesRight = handle.indexOf("e") >= 0;
    var movesTop = handle.indexOf("n") >= 0;
    var movesBottom = handle.indexOf("s") >= 0;

    function pushGuide(axis, guide) {
      if (guide == null) return;
      var list = axis === "x" ? guides.v : guides.h;
      if (list.indexOf(guide) < 0) list.push(guide);
    }

    if (movesLeft) {
      var snapL = snapEdgeCoord(x, state.left, "x", rect);
      x = snapL.value;
      w = anchorR - x;
      state.left = snapL.key;
      pushGuide("x", snapL.guide);
    }
    if (movesRight) {
      var snapR = snapEdgeCoord(anchorR, state.right, "x", rect);
      w = snapR.value - x;
      state.right = snapR.key;
      pushGuide("x", snapR.guide);
    }
    if (movesTop) {
      var snapT = snapEdgeCoord(y, state.top, "y", rect);
      y = snapT.value;
      h = anchorB - y;
      state.top = snapT.key;
      pushGuide("y", snapT.guide);
    }
    if (movesBottom) {
      var snapB = snapEdgeCoord(anchorB, state.bottom, "y", rect);
      h = snapB.value - y;
      state.bottom = snapB.key;
      pushGuide("y", snapB.guide);
    }

    return {
      layer: clampLayer(
        Object.assign({}, layer, { x: x, y: y, width: w, height: h })
      ),
      guides: guides,
      snapState: state,
    };
  }

  function snapAxis(value, size, axis, prevKey, rect, opts) {
    opts = opts || {};
    var useHysteresis = opts.hysteresis !== false;
    var span = axis === "x" ? rect.width : rect.height;
    if (!span) {
      return { value: value, guide: null, key: null };
    }

    var threshold = SNAP_THRESHOLD_PX / span;
    var release = SNAP_RELEASE_THRESHOLD_PX / span;
    var targets = [
      { key: "min", pos: 0, guide: 0 },
      { key: "center", pos: 0.5 - size / 2, guide: 0.5 },
      { key: "max", pos: 1 - size, guide: 1 },
    ];

    if (useHysteresis && prevKey) {
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].key === prevKey) {
          if (Math.abs(value - targets[i].pos) <= release) {
            return {
              value: targets[i].pos,
              guide: targets[i].guide,
              key: targets[i].key,
            };
          }
          break;
        }
      }
    }

    var best = null;
    for (var j = 0; j < targets.length; j++) {
      var dist = Math.abs(value - targets[j].pos);
      if (dist <= threshold && (!best || dist < best.dist)) {
        best = {
          value: targets[j].pos,
          guide: targets[j].guide,
          key: targets[j].key,
          dist: dist,
        };
      }
    }
    if (best) {
      return { value: best.value, guide: best.guide, key: best.key };
    }
    return { value: value, guide: null, key: null };
  }

  function snapMovePosition(layer, x, y, snapState, opts) {
    var guides = { v: [], h: [] };
    var state = snapState || { x: null, y: null };
    var rect = getFrameRect();
    if (!rect.width || !rect.height) {
      return { x: x, y: y, guides: guides, snapState: state };
    }

    var snapX = snapAxis(x, layer.width, "x", state.x, rect, opts);
    var snapY = snapAxis(y, layer.height, "y", state.y, rect, opts);
    if (snapX.guide != null) guides.v.push(snapX.guide);
    if (snapY.guide != null) guides.h.push(snapY.guide);

    return {
      x: snapX.value,
      y: snapY.value,
      guides: guides,
      snapState: { x: snapX.key, y: snapY.key },
    };
  }

  function moveLayerSnapped(layer, x, y, snapState, opts) {
    var snapped = snapMovePosition(layer, x, y, snapState, opts);
    return {
      layer: moveLayer(layer, snapped.x, snapped.y),
      guides: snapped.guides,
      snapState: snapped.snapState,
    };
  }

  function nudgeLayerSnapped(layer, dxNorm, dyNorm) {
    var nx = layer.x + dxNorm;
    var ny = layer.y + dyNorm;
    var w = layer.width;
    var h = layer.height;
    var currentlyOutside =
      layer.x < 0 || layer.y < 0 || layer.x + w > 1 || layer.y + h > 1;
    var wouldBeOutside = nx < 0 || ny < 0 || nx + w > 1 || ny + h > 1;

    if (currentlyOutside || wouldBeOutside) {
      return {
        layer: moveLayer(layer, nx, ny),
        guides: { v: [], h: [] },
        moved: nx !== layer.x || ny !== layer.y,
      };
    }

    var snapped = moveLayerSnapped(
      layer,
      nx,
      ny,
      null,
      { hysteresis: false }
    );
    return {
      layer: snapped.layer,
      guides: snapped.guides,
      moved: true,
    };
  }

  function fitFrameToPreview() {
    if (!frameEl || !frameEl.parentElement) return;
    var wrap = frameEl.parentElement;
    var wrapRect = wrap.getBoundingClientRect();
    var pad = 32;
    var availW = Math.max(1, wrapRect.width - pad);
    var availH = Math.max(1, wrapRect.height - pad);
    var scale = Math.min(availW / frameWidth, availH / frameHeight);
    var w = Math.max(1, Math.floor(frameWidth * scale));
    var h = Math.max(1, Math.floor(frameHeight * scale));
    frameEl.style.width = w + "px";
    frameEl.style.height = h + "px";
    frameEl.style.aspectRatio = frameWidth + " / " + frameHeight;
  }

  function setDimensions(width, height) {
    frameWidth = width || 1920;
    frameHeight = height || 1080;
    if (frameEl) {
      frameEl.style.aspectRatio = frameWidth + " / " + frameHeight;
      fitFrameToPreview();
    }
  }

  function getDimensions() {
    return { width: frameWidth, height: frameHeight };
  }

  function blurAmountToDisplayPx(amount) {
    if (!amount || amount <= 0) return 0;
    var rect = getFrameRect();
    var displayW = rect.width || 0;
    if (!displayW || !frameWidth) return amount;
    return amount * (displayW / frameWidth);
  }

  function frameSizeForPreset(preset, sourceW, sourceH) {
    var sw = sourceW || 1920;
    var sh = sourceH || 1080;
    if (preset === "original") return { width: sw, height: sh };
    var ratios = {
      "16:9": 16 / 9,
      "9:16": 9 / 16,
      "1:1": 1,
      "4:3": 4 / 3,
    };
    var ratio = ratios[preset];
    if (!ratio) return { width: sw, height: sh };
    var longEdge = Math.max(sw, sh);
    if (ratio >= 1) {
      return { width: longEdge, height: Math.round(longEdge / ratio) };
    }
    return { width: Math.round(longEdge * ratio), height: longEdge };
  }

  function init(el) {
    frameEl = el;
    if (frameEl) {
      frameEl.style.aspectRatio = frameWidth + " / " + frameHeight;
      fitFrameToPreview();
    }
    window.addEventListener("resize", function () {
      fitFrameToPreview();
      if (typeof window.EditorApp !== "undefined" && window.EditorApp.onFrameResize) {
        window.EditorApp.onFrameResize();
      }
    });
  }

  window.EditorFrame = {
    init: init,
    setDimensions: setDimensions,
    getDimensions: getDimensions,
    blurAmountToDisplayPx: blurAmountToDisplayPx,
    getFrameRect: getFrameRect,
    normToPx: normToPx,
    pxToNorm: pxToNorm,
    clampLayer: clampLayer,
    moveLayer: moveLayer,
    moveLayerSnapped: moveLayerSnapped,
    nudgeLayerSnapped: nudgeLayerSnapped,
    detectLayerSnap: detectLayerSnap,
    snapResizeLayer: snapResizeLayer,
    SNAP_THRESHOLD_PX: SNAP_THRESHOLD_PX,
    SNAP_RELEASE_THRESHOLD_PX: SNAP_RELEASE_THRESHOLD_PX,
    frameSizeForPreset: frameSizeForPreset,
    fitFrameToPreview: fitFrameToPreview,
    MIN_LAYER_SIZE: MIN_LAYER_SIZE,
    MAX_LAYER_OVERFLOW: MAX_LAYER_OVERFLOW,
  };
})();
