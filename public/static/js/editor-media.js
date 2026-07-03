(function () {
  "use strict";

  var PREFETCH_SEC = 2;
  var RELEASE_SEC = 10;

  var getState = null;
  var getCurrentTime = null;
  var getJobIdentifier = null;

  function init(opts) {
    getState = opts.getState;
    getCurrentTime = opts.getCurrentTime;
    getJobIdentifier = opts.getJobIdentifier;
  }

  function layerTimeRange(layer) {
    var start = layer.start != null ? layer.start : 0;
    var end = layer.end != null ? layer.end : start + 5;
    return { start: start, end: end };
  }

  function isMediaLayer(layer) {
    return layer && (layer.kind === "video" || layer.kind === "image");
  }

  function isLayerActiveAtTime(layer, t) {
    if (!isMediaLayer(layer) || !layer.fileId) return false;
    var range = layerTimeRange(layer);
    return t >= range.start && t < range.end;
  }

  function isLayerNearTime(layer, t, margin) {
    if (!isMediaLayer(layer) || !layer.fileId) return false;
    var range = layerTimeRange(layer);
    return t >= range.start - margin && t < range.end + margin;
  }

  function mediaSrc(layer) {
    if (layer.src) return layer.src;
    if (layer.mediaUrl) return layer.mediaUrl;
    return "";
  }

  function ensureLayerMedia(layer) {
    if (!isMediaLayer(layer) || !layer.fileId) return;
    if (layer.mediaState === "ready" || layer.mediaState === "loading") return;

    var src = mediaSrc(layer);
    if (!src) return;

    layer.mediaState = "loading";

    if (layer.kind === "image") {
      var img = new Image();
      img.onload = function () {
        layer.mediaState = "ready";
        layer.src = src;
        notifyLayerUpdated(layer);
      };
      img.onerror = function () {
        layer.mediaState = "error";
        notifyLayerUpdated(layer);
      };
      img.src = src;
      return;
    }

    var vid = document.createElement("video");
    vid.preload = "metadata";
    vid.muted = true;
    vid.playsInline = true;
    vid.onloadeddata = function () {
      layer.mediaState = "ready";
      layer.src = src;
      notifyLayerUpdated(layer);
      vid.removeAttribute("src");
      vid.load();
    };
    vid.onerror = function () {
      layer.mediaState = "error";
      notifyLayerUpdated(layer);
      vid.removeAttribute("src");
      vid.load();
    };
    vid.src = src;
  }

  function releaseLayerMedia(layer) {
    if (!isMediaLayer(layer) || !layer.fileId) return;
    if (layer.mediaState !== "ready" && layer.mediaState !== "loading") return;

    layer.mediaState = "idle";
    delete layer.src;
    notifyLayerUpdated(layer);
  }

  function notifyLayerUpdated(layer) {
    if (window.EditorApp && window.EditorApp.refreshUI) {
      window.EditorApp.refreshUI();
    }
    if (window.EditorLayers && window.EditorLayers.patchLayerDOM) {
      window.EditorLayers.patchLayerDOM(layer);
    }
  }

  function onTimeUpdate(t) {
    if (!getState) return;
    var state = getState();
    if (!state || !state.layers) return;

    state.layers.forEach(function (layer) {
      if (!isMediaLayer(layer) || !layer.fileId) return;

      if (isLayerActiveAtTime(layer, t) || isLayerNearTime(layer, t, PREFETCH_SEC)) {
        ensureLayerMedia(layer);
        return;
      }

      if (!isLayerNearTime(layer, t, RELEASE_SEC)) {
        releaseLayerMedia(layer);
      }
    });
  }

  window.EditorMedia = {
    init: init,
    ensureLayerMedia: ensureLayerMedia,
    releaseLayerMedia: releaseLayerMedia,
    onTimeUpdate: onTimeUpdate,
  };
})();
