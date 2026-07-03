(function () {
  "use strict";

  var frameEl = null;
  var previewSvg = null;
  var getState = null;
  var addLayer = null;
  var getCurrentTime = null;
  var getDuration = null;
  var setActiveTool = null;
  var onToolChange = null;

  var activeTool = null;
  var drawStroke = "#ffffff";
  var drawStrokeWidth = 4;
  var shapeFill = "transparent";
  var shapeFillHasColor = false;

  var shapeDrag = null;
  var brushStroke = null;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function frameHeightPx() {
    if (!frameEl) return 400;
    return frameEl.getBoundingClientRect().height || 400;
  }

  function normStrokeWidth(px, layerHeightNorm) {
    var layerPx = Math.max(1, layerHeightNorm * frameHeightPx());
    return px / layerPx;
  }

  function normFromEvent(e) {
    var rect = frameEl.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function isToolActive() {
    return !!activeTool;
  }

  function clearPreview() {
    if (!previewSvg) return;
    previewSvg.innerHTML = "";
    previewSvg.hidden = true;
  }

  function showPreview() {
    if (!previewSvg) return;
    previewSvg.hidden = false;
    previewSvg.setAttribute("viewBox", "0 0 1 1");
    previewSvg.setAttribute("preserveAspectRatio", "none");
  }

  function defaultTiming() {
    var t = getCurrentTime ? getCurrentTime() : 0;
    var d = getDuration ? getDuration() : 10;
    return {
      start: t,
      end: Math.min(t + 5, d),
      alwaysVisible: false,
    };
  }

  function defaultShapeLayer(shape, x, y, w, h) {
    return Object.assign(
      {
        id: window.EditorLayers.nextId(),
        kind: "shape",
        shape: shape,
        x: x,
        y: y,
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        visible: true,
        stroke: drawStroke,
        fill: shapeFillHasColor ? shapeFill : "transparent",
        strokeWidth: drawStrokeWidth,
      },
      defaultTiming()
    );
  }

  function defaultDrawLayer(paths, x, y, w, h) {
    return Object.assign(
      {
        id: window.EditorLayers.nextId(),
        kind: "draw",
        paths: paths,
        x: x,
        y: y,
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        visible: true,
      },
      defaultTiming()
    );
  }

  function shapeSvgMarkup(layer) {
    var h = layer.height || 0.1;
    var sw = normStrokeWidth(layer.strokeWidth || 4, h);
    var stroke = layer.stroke || "#ffffff";
    var fill = layer.fill || "transparent";
    var shape = layer.shape || "rect";
    if (shape === "rect") {
      return (
        '<rect x="0" y="0" width="1" height="1" fill="' +
        fill +
        '" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" vector-effect="non-scaling-stroke" />'
      );
    }
    if (shape === "circle") {
      return (
        '<ellipse cx="0.5" cy="0.5" rx="0.5" ry="0.5" fill="' +
        fill +
        '" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" vector-effect="non-scaling-stroke" />'
      );
    }
    if (shape === "line") {
      return (
        '<line x1="0" y1="0" x2="1" y2="1" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" vector-effect="non-scaling-stroke" />'
      );
    }
    if (shape === "arrow") {
      return (
        '<line x1="0" y1="0.5" x2="0.85" y2="0.5" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" vector-effect="non-scaling-stroke" />' +
        '<polygon points="0.85,0.35 1,0.5 0.85,0.65" fill="' +
        stroke +
        '" />'
      );
    }
    return "";
  }

  function drawPathsMarkup(layer) {
    if (!layer.paths || !layer.paths.length) return "";
    var h = layer.height || 0.1;
    return layer.paths
      .map(function (path) {
        if (!path.points || path.points.length < 2) return "";
        var d = "M " + path.points[0][0] + " " + path.points[0][1];
        for (var i = 1; i < path.points.length; i++) {
          d += " L " + path.points[i][0] + " " + path.points[i][1];
        }
        var sw = normStrokeWidth(path.width || 4, h);
        return (
          '<path d="' +
          d +
          '" fill="none" stroke="' +
          (path.stroke || "#ffffff") +
          '" stroke-width="' +
          sw +
          '" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />'
        );
      })
      .join("");
  }

  function renderShapePreview(shape, x1, y1, x2, y2) {
    var x = Math.min(x1, x2);
    var y = Math.min(y1, y2);
    var w = Math.max(0.02, Math.abs(x2 - x1));
    var h = Math.max(0.02, Math.abs(y2 - y1));
    var layer = {
      shape: shape,
      stroke: drawStroke,
      fill: shapeFillHasColor ? shapeFill : "transparent",
      strokeWidth: drawStrokeWidth,
      height: h,
    };
    previewSvg.style.left = x * 100 + "%";
    previewSvg.style.top = y * 100 + "%";
    previewSvg.style.width = w * 100 + "%";
    previewSvg.style.height = h * 100 + "%";
    previewSvg.innerHTML = shapeSvgMarkup(layer);
  }

  function renderBrushPreview(points) {
    if (!points || points.length < 2) return;
    var xs = points.map(function (p) {
      return p[0];
    });
    var ys = points.map(function (p) {
      return p[1];
    });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var pad = 0.01;
    minX = clamp(minX - pad, 0, 1);
    minY = clamp(minY - pad, 0, 1);
    maxX = clamp(maxX + pad, 0, 1);
    maxY = clamp(maxY + pad, 0, 1);
    var w = Math.max(0.02, maxX - minX);
    var h = Math.max(0.02, maxY - minY);
    var normPts = points.map(function (p) {
      return [(p[0] - minX) / w, (p[1] - minY) / h];
    });
    previewSvg.style.left = minX * 100 + "%";
    previewSvg.style.top = minY * 100 + "%";
    previewSvg.style.width = w * 100 + "%";
    previewSvg.style.height = h * 100 + "%";
    previewSvg.innerHTML = drawPathsMarkup({
      paths: [{ points: normPts, stroke: drawStroke, width: drawStrokeWidth }],
      height: h,
    });
  }

  function commitBrush(points) {
    if (!points || points.length < 2) return;
    var xs = points.map(function (p) {
      return p[0];
    });
    var ys = points.map(function (p) {
      return p[1];
    });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var pad = 0.01;
    minX = clamp(minX - pad, 0, 1);
    minY = clamp(minY - pad, 0, 1);
    maxX = clamp(maxX + pad, 0, 1);
    maxY = clamp(maxY + pad, 0, 1);
    var w = Math.max(0.02, maxX - minX);
    var h = Math.max(0.02, maxY - minY);
    var normPts = points.map(function (p) {
      return [(p[0] - minX) / w, (p[1] - minY) / h];
    });
    var layer = defaultDrawLayer(
      [{ points: normPts, stroke: drawStroke, width: drawStrokeWidth }],
      minX,
      minY,
      w,
      h
    );
    layer = window.EditorFrame.clampLayer(layer);
    if (addLayer) addLayer(layer);
  }

  function commitShape(shape, x1, y1, x2, y2) {
    var x = Math.min(x1, x2);
    var y = Math.min(y1, y2);
    var w = Math.max(0.02, Math.abs(x2 - x1));
    var h = Math.max(0.02, Math.abs(y2 - y1));
    var layer = defaultShapeLayer(shape, x, y, w, h);
    layer = window.EditorFrame.clampLayer(layer);
    if (addLayer) addLayer(layer);
  }

  function setTool(tool) {
    activeTool = tool;
    clearPreview();
    shapeDrag = null;
    brushStroke = null;
    if (frameEl) {
      frameEl.classList.toggle("editor-frame--draw-tool", !!tool);
    }
    if (onToolChange) onToolChange(tool);
  }

  function onFramePointerDown(e) {
    if (!activeTool || !frameEl) return;
    if (e.target.closest(".editor-layer")) return;
    if (e.target.closest("#editorTransformBox")) return;
    e.preventDefault();
    e.stopPropagation();

    var p = normFromEvent(e);
    if (activeTool === "brush") {
      brushStroke = { points: [[p.x, p.y]] };
      showPreview();
      frameEl.setPointerCapture(e.pointerId);
      frameEl.addEventListener("pointermove", onBrushMove);
      frameEl.addEventListener("pointerup", onBrushUp);
      frameEl.addEventListener("pointercancel", onBrushUp);
      return;
    }
    if (activeTool.indexOf("shape-") === 0) {
      shapeDrag = {
        shape: activeTool.replace("shape-", ""),
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
      };
      showPreview();
      frameEl.setPointerCapture(e.pointerId);
      frameEl.addEventListener("pointermove", onShapeMove);
      frameEl.addEventListener("pointerup", onShapeUp);
      frameEl.addEventListener("pointercancel", onShapeUp);
    }
  }

  function onShapeMove(e) {
    if (!shapeDrag) return;
    var p = normFromEvent(e);
    shapeDrag.x2 = p.x;
    shapeDrag.y2 = p.y;
    renderShapePreview(shapeDrag.shape, shapeDrag.x1, shapeDrag.y1, shapeDrag.x2, shapeDrag.y2);
  }

  function onShapeUp(e) {
    if (!shapeDrag) return;
    frameEl.releasePointerCapture(e.pointerId);
    frameEl.removeEventListener("pointermove", onShapeMove);
    frameEl.removeEventListener("pointerup", onShapeUp);
    frameEl.removeEventListener("pointercancel", onShapeUp);
    commitShape(shapeDrag.shape, shapeDrag.x1, shapeDrag.y1, shapeDrag.x2, shapeDrag.y2);
    shapeDrag = null;
    clearPreview();
  }

  function onBrushMove(e) {
    if (!brushStroke) return;
    var p = normFromEvent(e);
    brushStroke.points.push([p.x, p.y]);
    renderBrushPreview(brushStroke.points);
  }

  function onBrushUp(e) {
    if (!brushStroke) return;
    frameEl.releasePointerCapture(e.pointerId);
    frameEl.removeEventListener("pointermove", onBrushMove);
    frameEl.removeEventListener("pointerup", onBrushUp);
    frameEl.removeEventListener("pointercancel", onBrushUp);
    commitBrush(brushStroke.points);
    brushStroke = null;
    clearPreview();
  }

  function init(opts) {
    frameEl = opts.frameEl;
    previewSvg = opts.previewSvg;
    getState = opts.getState;
    addLayer = opts.addLayer;
    getCurrentTime = opts.getCurrentTime;
    getDuration = opts.getDuration;
    onToolChange = opts.onToolChange;
    if (opts.drawStroke) drawStroke = opts.drawStroke;
    if (opts.drawStrokeWidth) drawStrokeWidth = opts.drawStrokeWidth;
  }

  window.EditorDraw = {
    init: init,
    isToolActive: isToolActive,
    setTool: setTool,
    getTool: function () {
      return activeTool;
    },
    onFramePointerDown: onFramePointerDown,
    shapeSvgMarkup: shapeSvgMarkup,
    drawPathsMarkup: drawPathsMarkup,
    setDrawStroke: function (c) {
      drawStroke = c;
    },
    setDrawStrokeWidth: function (w) {
      drawStrokeWidth = w;
    },
    setShapeFill: function (f, hasColor) {
      shapeFill = f;
      shapeFillHasColor = !!hasColor;
    },
    getDrawStroke: function () {
      return drawStroke;
    },
    getShapeFill: function () {
      return shapeFillHasColor ? shapeFill : "transparent";
    },
  };
})();
