(function () {
  "use strict";

  var MIN_LAYER_SIZE = 0.02;
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
    var w = clamp(layer.width, MIN_LAYER_SIZE, 1);
    var h = clamp(layer.height, MIN_LAYER_SIZE, 1);
    var x = clamp(layer.x, 0, 1 - w);
    var y = clamp(layer.y, 0, 1 - h);
    return Object.assign({}, layer, { x: x, y: y, width: w, height: h });
  }

  function setDimensions(width, height) {
    frameWidth = width || 1920;
    frameHeight = height || 1080;
    if (frameEl) {
      frameEl.style.aspectRatio = frameWidth + " / " + frameHeight;
    }
  }

  function getDimensions() {
    return { width: frameWidth, height: frameHeight };
  }

  function init(el) {
    frameEl = el;
    if (frameEl) {
      frameEl.style.aspectRatio = frameWidth + " / " + frameHeight;
    }
    window.addEventListener("resize", function () {
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
    MIN_LAYER_SIZE: MIN_LAYER_SIZE,
  };
})();
