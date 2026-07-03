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
  var drawStrokeWidth = 6;
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

  function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function shapeStyle(layer) {
    return {
      sw: Math.max(1, layer.strokeWidth != null ? layer.strokeWidth : drawStrokeWidth),
      stroke: layer.stroke != null ? layer.stroke : drawStroke,
      fill: layer.fill != null ? layer.fill : "transparent",
    };
  }

  function paintShapeLayer(svg, layer, pxW, pxH) {
    clearSvg(svg);
    var w = Math.max(1, pxW || 100);
    var h = Math.max(1, pxH || 100);
    var style = shapeStyle(layer);
    var sw = style.sw;
    var stroke = style.stroke;
    var fill = style.fill;
    var shape = layer.shape || "rect";
    var inset = sw / 2;
    var NS = "http://www.w3.org/2000/svg";
    var node;

    if (shape === "rect") {
      node = document.createElementNS(NS, "rect");
      node.setAttribute("x", String(inset));
      node.setAttribute("y", String(inset));
      node.setAttribute("width", String(Math.max(0, w - sw)));
      node.setAttribute("height", String(Math.max(0, h - sw)));
      node.setAttribute("fill", fill);
      node.setAttribute("stroke", stroke);
      node.setAttribute("stroke-width", String(sw));
      svg.appendChild(node);
      return;
    }
    if (shape === "circle") {
      node = document.createElementNS(NS, "ellipse");
      node.setAttribute("cx", String(w / 2));
      node.setAttribute("cy", String(h / 2));
      node.setAttribute("rx", String(Math.max(0, w / 2 - inset)));
      node.setAttribute("ry", String(Math.max(0, h / 2 - inset)));
      node.setAttribute("fill", fill);
      node.setAttribute("stroke", stroke);
      node.setAttribute("stroke-width", String(sw));
      svg.appendChild(node);
      return;
    }
    if (shape === "line") {
      node = document.createElementNS(NS, "line");
      node.setAttribute("x1", String(inset));
      node.setAttribute("y1", String(inset));
      node.setAttribute("x2", String(w - inset));
      node.setAttribute("y2", String(h - inset));
      node.setAttribute("fill", "none");
      node.setAttribute("stroke", stroke);
      node.setAttribute("stroke-width", String(sw));
      node.setAttribute("stroke-linecap", "round");
      svg.appendChild(node);
      return;
    }
    if (shape === "triangle") {
      node = document.createElementNS(NS, "polygon");
      node.setAttribute(
        "points",
        w / 2 + "," + inset + " " + (w - inset) + "," + (h - inset) + " " + inset + "," + (h - inset)
      );
      node.setAttribute("fill", fill);
      node.setAttribute("stroke", stroke);
      node.setAttribute("stroke-width", String(sw));
      node.setAttribute("stroke-linejoin", "round");
      svg.appendChild(node);
      return;
    }
    if (shape === "arrow") {
      var head = Math.min(w, h) * 0.2;
      var line = document.createElementNS(NS, "line");
      line.setAttribute("x1", String(inset));
      line.setAttribute("y1", String(h / 2));
      line.setAttribute("x2", String(w - inset - head));
      line.setAttribute("y2", String(h / 2));
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", stroke);
      line.setAttribute("stroke-width", String(sw));
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
      var arrowHead = document.createElementNS(NS, "polygon");
      arrowHead.setAttribute(
        "points",
        w - inset - head + "," + (h / 2 - head) +
          " " + (w - inset) + "," + h / 2 +
          " " + (w - inset - head) + "," + (h / 2 + head)
      );
      arrowHead.setAttribute("fill", stroke);
      svg.appendChild(arrowHead);
    }
  }

  function paintDrawLayer(svg, layer, pxW, pxH) {
    clearSvg(svg);
    if (!layer.paths || !layer.paths.length) return;
    var w = Math.max(1, pxW || 100);
    var h = Math.max(1, pxH || 100);
    var NS = "http://www.w3.org/2000/svg";
    layer.paths.forEach(function (path) {
      if (!path.points || path.points.length < 2) return;
      var d = "M " + path.points[0][0] * w + " " + path.points[0][1] * h;
      for (var i = 1; i < path.points.length; i++) {
        d += " L " + path.points[i][0] * w + " " + path.points[i][1] * h;
      }
      var node = document.createElementNS(NS, "path");
      node.setAttribute("d", d);
      node.setAttribute("fill", "none");
      node.setAttribute("stroke", path.stroke || drawStroke);
      node.setAttribute("stroke-width", String(Math.max(1, path.width || drawStrokeWidth)));
      node.setAttribute("stroke-linecap", "round");
      node.setAttribute("stroke-linejoin", "round");
      svg.appendChild(node);
    });
  }

  function shapeSvgMarkup(layer, pxW, pxH) {
    var w = Math.max(1, pxW || 100);
    var h = Math.max(1, pxH || 100);
    var sw = Math.max(1, layer.strokeWidth || drawStrokeWidth || 6);
    var stroke = layer.stroke || drawStroke || "#ffffff";
    var fill = layer.fill || "transparent";
    var shape = layer.shape || "rect";
    var inset = sw / 2;

    if (shape === "rect") {
      return (
        '<rect x="' +
        inset +
        '" y="' +
        inset +
        '" width="' +
        Math.max(0, w - sw) +
        '" height="' +
        Math.max(0, h - sw) +
        '" fill="' +
        fill +
        '" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" />'
      );
    }
    if (shape === "circle") {
      return (
        '<ellipse cx="' +
        w / 2 +
        '" cy="' +
        h / 2 +
        '" rx="' +
        Math.max(0, w / 2 - inset) +
        '" ry="' +
        Math.max(0, h / 2 - inset) +
        '" fill="' +
        fill +
        '" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" />'
      );
    }
    if (shape === "line") {
      return (
        '<line x1="' +
        inset +
        '" y1="' +
        inset +
        '" x2="' +
        (w - inset) +
        '" y2="' +
        (h - inset) +
        '" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" stroke-linecap="round" />'
      );
    }
    if (shape === "triangle") {
      return (
        '<polygon points="' +
        w / 2 +
        "," +
        inset +
        " " +
        (w - inset) +
        "," +
        (h - inset) +
        " " +
        inset +
        "," +
        (h - inset) +
        '" fill="' +
        fill +
        '" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" stroke-linejoin="round" />'
      );
    }
    if (shape === "arrow") {
      var head = Math.min(w, h) * 0.2;
      return (
        '<line x1="' +
        inset +
        '" y1="' +
        h / 2 +
        '" x2="' +
        (w - inset - head) +
        '" y2="' +
        h / 2 +
        '" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" stroke-linecap="round" />' +
        '<polygon points="' +
        (w - inset - head) +
        "," +
        (h / 2 - head) +
        " " +
        (w - inset) +
        "," +
        h / 2 +
        " " +
        (w - inset - head) +
        "," +
        (h / 2 + head) +
        '" fill="' +
        stroke +
        '" />'
      );
    }
    return "";
  }

  function drawPathsMarkup(layer, pxW, pxH) {
    if (!layer.paths || !layer.paths.length) return "";
    var w = Math.max(1, pxW || 100);
    var h = Math.max(1, pxH || 100);
    return layer.paths
      .map(function (path) {
        if (!path.points || path.points.length < 2) return "";
        var d =
          "M " +
          path.points[0][0] * w +
          " " +
          path.points[0][1] * h;
        for (var i = 1; i < path.points.length; i++) {
          d += " L " + path.points[i][0] * w + " " + path.points[i][1] * h;
        }
        var sw = Math.max(1, path.width || drawStrokeWidth || 6);
        return (
          '<path d="' +
          d +
          '" fill="none" stroke="' +
          (path.stroke || drawStroke || "#ffffff") +
          '" stroke-width="' +
          sw +
          '" stroke-linecap="round" stroke-linejoin="round" />'
        );
      })
      .join("");
  }

  function renderShapePreview(shape, x1, y1, x2, y2) {
    var x = Math.min(x1, x2);
    var y = Math.min(y1, y2);
    var w = Math.max(0.02, Math.abs(x2 - x1));
    var h = Math.max(0.02, Math.abs(y2 - y1));
    var frameRect =
      window.EditorFrame && window.EditorFrame.getFrameRect
        ? window.EditorFrame.getFrameRect()
        : { width: 1, height: 1 };
    var pxW = Math.max(1, w * frameRect.width);
    var pxH = Math.max(1, h * frameRect.height);
    var layer = {
      shape: shape,
      stroke: drawStroke,
      fill: shapeFillHasColor ? shapeFill : "transparent",
      strokeWidth: drawStrokeWidth,
    };
    previewSvg.style.left = x * 100 + "%";
    previewSvg.style.top = y * 100 + "%";
    previewSvg.style.width = w * 100 + "%";
    previewSvg.style.height = h * 100 + "%";
    previewSvg.setAttribute("viewBox", "0 0 " + pxW + " " + pxH);
    previewSvg.setAttribute("preserveAspectRatio", "none");
    previewSvg.innerHTML = shapeSvgMarkup(layer, pxW, pxH);
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
    var frameRect =
      window.EditorFrame && window.EditorFrame.getFrameRect
        ? window.EditorFrame.getFrameRect()
        : { width: 1, height: 1 };
    var pxW = Math.max(1, w * frameRect.width);
    var pxH = Math.max(1, h * frameRect.height);
    previewSvg.setAttribute("viewBox", "0 0 " + pxW + " " + pxH);
    previewSvg.setAttribute("preserveAspectRatio", "none");
    previewSvg.innerHTML = drawPathsMarkup(
      {
        paths: [{ points: normPts, stroke: drawStroke, width: drawStrokeWidth }],
      },
      pxW,
      pxH
    );
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
    paintShapeLayer: paintShapeLayer,
    paintDrawLayer: paintDrawLayer,
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
    getDrawStrokeWidth: function () {
      return drawStrokeWidth;
    },
    getShapeFill: function () {
      return shapeFillHasColor ? shapeFill : "transparent";
    },
  };
})();
