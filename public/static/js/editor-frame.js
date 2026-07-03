(function () {
  "use strict";

  var MIN_LAYER_SIZE = 0.02;
  var MAX_VIDEO_OVERFLOW = 4;
  var frameEl = null;
  var videoLayerEl = null;
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
    var w = clamp(layer.width, MIN_LAYER_SIZE, 1);
    var h = clamp(layer.height, MIN_LAYER_SIZE, 1);
    var x = clamp(layer.x, 0, 1 - w);
    var y = clamp(layer.y, 0, 1 - h);
    return Object.assign({}, layer, { x: x, y: y, width: w, height: h });
  }

  function clampVideoTransform(transform) {
    var w = clamp(transform.width, MIN_LAYER_SIZE, MAX_VIDEO_OVERFLOW);
    var h = clamp(transform.height, MIN_LAYER_SIZE, MAX_VIDEO_OVERFLOW);
    return Object.assign({ rotation: 0, opacity: 1 }, transform, {
      width: w,
      height: h,
    });
  }

  function moveVideoTransform(transform, x, y) {
    return clampVideoTransform(Object.assign({}, transform, { x: x, y: y }));
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

  function applyVideoTransform(transform) {
    if (!videoLayerEl || !transform) return;
    videoLayerEl.style.left = transform.x * 100 + "%";
    videoLayerEl.style.top = transform.y * 100 + "%";
    videoLayerEl.style.width = transform.width * 100 + "%";
    videoLayerEl.style.height = transform.height * 100 + "%";
    videoLayerEl.style.transform = "rotate(" + (transform.rotation || 0) + "deg)";
    videoLayerEl.style.opacity =
      transform.opacity != null ? transform.opacity : 1;
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

  function init(el, opts) {
    frameEl = el;
    videoLayerEl = opts && opts.videoLayerEl;
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
    getFrameRect: getFrameRect,
    normToPx: normToPx,
    pxToNorm: pxToNorm,
    clampLayer: clampLayer,
    clampVideoTransform: clampVideoTransform,
    moveVideoTransform: moveVideoTransform,
    applyVideoTransform: applyVideoTransform,
    frameSizeForPreset: frameSizeForPreset,
    fitFrameToPreview: fitFrameToPreview,
    MIN_LAYER_SIZE: MIN_LAYER_SIZE,
  };
})();
