(function () {
  "use strict";

  var frameEl = null;
  var previewSvg = null;
  var blurPreviewEl = null;
  var getState = null;
  var addLayer = null;
  var getCurrentTime = null;
  var getDuration = null;
  var setActiveTool = null;
  var onToolChange = null;

  var activeTool = null;
  var drawStroke = "#ff0000";
  var drawStrokeWidth = 6;
  var shapeFill = "transparent";
  var shapeFillHasColor = false;
  var blurAmount = 12;

  function fillHasColor(value) {
    if (value == null) return false;
    var v = String(value).trim().toLowerCase();
    return v !== "" && v !== "transparent" && v !== "none";
  }

  var shapeDrag = null;
  var brushStroke = null;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function frameHeightPx() {
    if (!frameEl) return 400;
    return frameEl.getBoundingClientRect().height || 400;
  }

  function getFrameRect() {
    if (window.EditorFrame && window.EditorFrame.getFrameRect) {
      return window.EditorFrame.getFrameRect();
    }
    if (!frameEl) return { width: 1, height: 1 };
    return frameEl.getBoundingClientRect();
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

  function isArrowLayer(layer) {
    return !!(layer && layer.kind === "shape" && layer.shape === "arrow");
  }

  function hasArrowEndpoints(layer) {
    return (
      layer &&
      layer.x1 != null &&
      layer.y1 != null &&
      layer.x2 != null &&
      layer.y2 != null &&
      isFinite(layer.x1) &&
      isFinite(layer.y1) &&
      isFinite(layer.x2) &&
      isFinite(layer.y2)
    );
  }

  function ensureArrowEndpoints(layer) {
    if (!isArrowLayer(layer)) return layer;
    if (hasArrowEndpoints(layer)) return layer;
    return Object.assign({}, layer, {
      x1: layer.x,
      y1: layer.y + (layer.height || 0) / 2,
      x2: layer.x + (layer.width || 0),
      y2: layer.y + (layer.height || 0) / 2,
    });
  }

  function arrowPadNorm(strokeWidth) {
    var rect = getFrameRect();
    var padPx = Math.max((strokeWidth || drawStrokeWidth || 6) * 2.5, 14);
    return {
      x: padPx / Math.max(1, rect.width || 1),
      y: padPx / Math.max(1, rect.height || 1),
    };
  }

  function syncArrowBBox(layer) {
    if (!hasArrowEndpoints(layer)) return layer;
    var pad = arrowPadNorm(layer.strokeWidth);
    var minX = Math.min(layer.x1, layer.x2);
    var maxX = Math.max(layer.x1, layer.x2);
    var minY = Math.min(layer.y1, layer.y2);
    var maxY = Math.max(layer.y1, layer.y2);
    return Object.assign({}, layer, {
      x: minX - pad.x,
      y: minY - pad.y,
      width: Math.max(0.02, maxX - minX + 2 * pad.x),
      height: Math.max(0.02, maxY - minY + 2 * pad.y),
      rotation: 0,
    });
  }

  function snapArrowTip(sx, sy, ex, ey) {
    var rect = getFrameRect();
    var fw = Math.max(1, rect.width || 1);
    var fh = Math.max(1, rect.height || 1);
    var dx = (ex - sx) * fw;
    var dy = (ey - sy) * fh;
    var len = Math.hypot(dx, dy);
    if (len < 1e-6) return { x: ex, y: ey };
    var angle = Math.atan2(dy, dx);
    var snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return {
      x: sx + (Math.cos(snapped) * len) / fw,
      y: sy + (Math.sin(snapped) * len) / fh,
    };
  }

  function snapSquareCorner(x1, y1, x2, y2) {
    var rect = getFrameRect();
    var fw = Math.max(1, rect.width || 1);
    var fh = Math.max(1, rect.height || 1);
    var dx = (x2 - x1) * fw;
    var dy = (y2 - y1) * fh;
    var size = Math.max(Math.abs(dx), Math.abs(dy));
    if (size < 1e-6) return { x: x2, y: y2 };
    var sx = dx >= 0 ? 1 : -1;
    var sy = dy >= 0 ? 1 : -1;
    return {
      x: x1 + (sx * size) / fw,
      y: y1 + (sy * size) / fh,
    };
  }

  function applyShapeDragShift(p, shiftKey) {
    if (!shapeDrag || !shiftKey) return p;
    if (shapeDrag.kind === "shape" && shapeDrag.shape === "arrow") {
      return snapArrowTip(shapeDrag.x1, shapeDrag.y1, p.x, p.y);
    }
    if (
      shapeDrag.kind === "blur" ||
      (shapeDrag.kind === "shape" && shapeDrag.shape !== "arrow")
    ) {
      return snapSquareCorner(shapeDrag.x1, shapeDrag.y1, p.x, p.y);
    }
    return p;
  }

  function resolveArrowLocalEnds(layer, pxW, pxH) {
    var w = Math.max(1, pxW || 100);
    var h = Math.max(1, pxH || 100);
    var sw = Math.max(1, layer.strokeWidth != null ? layer.strokeWidth : drawStrokeWidth);
    var inset = sw / 2;
    if (
      hasArrowEndpoints(layer) &&
      layer.width > 0 &&
      layer.height > 0
    ) {
      return {
        x1: ((layer.x1 - layer.x) / layer.width) * w,
        y1: ((layer.y1 - layer.y) / layer.height) * h,
        x2: ((layer.x2 - layer.x) / layer.width) * w,
        y2: ((layer.y2 - layer.y) / layer.height) * h,
      };
    }
    return { x1: inset, y1: h / 2, x2: w - inset, y2: h / 2 };
  }

  function arrowGeometry(ax1, ay1, ax2, ay2, sw) {
    var dx = ax2 - ax1;
    var dy = ay2 - ay1;
    var len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      return {
        shaftX1: ax1,
        shaftY1: ay1,
        shaftX2: ax1,
        shaftY2: ay1,
        tipX: ax2,
        tipY: ay2,
        wing1X: ax2,
        wing1Y: ay2,
        wing2X: ax2,
        wing2Y: ay2,
      };
    }
    var ux = dx / len;
    var uy = dy / len;
    var px = -uy;
    var py = ux;
    var headLen = Math.min(len * 0.28, Math.max(sw * 3.5, 14));
    var headHalf = headLen * 0.55;
    var tipX = ax2;
    var tipY = ay2;
    var baseX = tipX - ux * headLen;
    var baseY = tipY - uy * headLen;
    return {
      shaftX1: ax1,
      shaftY1: ay1,
      shaftX2: baseX,
      shaftY2: baseY,
      tipX: tipX,
      tipY: tipY,
      wing1X: baseX + px * headHalf,
      wing1Y: baseY + py * headHalf,
      wing2X: baseX - px * headHalf,
      wing2Y: baseY - py * headHalf,
    };
  }

  function arrowMarkupFromGeom(geom, stroke, sw) {
    return (
      '<line x1="' +
      geom.shaftX1 +
      '" y1="' +
      geom.shaftY1 +
      '" x2="' +
      geom.shaftX2 +
      '" y2="' +
      geom.shaftY2 +
      '" stroke="' +
      stroke +
      '" stroke-width="' +
      sw +
      '" stroke-linecap="round" />' +
      '<polygon points="' +
      geom.wing1X +
      "," +
      geom.wing1Y +
      " " +
      geom.tipX +
      "," +
      geom.tipY +
      " " +
      geom.wing2X +
      "," +
      geom.wing2Y +
      '" fill="' +
      stroke +
      '" />'
    );
  }

  function appendArrowNodes(svg, geom, stroke, sw) {
    var NS = "http://www.w3.org/2000/svg";
    var line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(geom.shaftX1));
    line.setAttribute("y1", String(geom.shaftY1));
    line.setAttribute("x2", String(geom.shaftX2));
    line.setAttribute("y2", String(geom.shaftY2));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", String(sw));
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
    var arrowHead = document.createElementNS(NS, "polygon");
    arrowHead.setAttribute(
      "points",
      geom.wing1X +
        "," +
        geom.wing1Y +
        " " +
        geom.tipX +
        "," +
        geom.tipY +
        " " +
        geom.wing2X +
        "," +
        geom.wing2Y
    );
    arrowHead.setAttribute("fill", stroke);
    svg.appendChild(arrowHead);
  }

  function isToolActive() {
    return !!activeTool;
  }

  function clearPreview() {
    if (previewSvg) {
      previewSvg.innerHTML = "";
      previewSvg.hidden = true;
    }
    if (blurPreviewEl) {
      blurPreviewEl.hidden = true;
      blurPreviewEl.style.backdropFilter = "";
      blurPreviewEl.style.webkitBackdropFilter = "";
    }
  }

  function showPreview() {
    if (!previewSvg) return;
    previewSvg.hidden = false;
    previewSvg.setAttribute("viewBox", "0 0 1 1");
    previewSvg.setAttribute("preserveAspectRatio", "none");
  }

  function defaultTiming() {
    var t = getCurrentTime ? getCurrentTime() : 0;
    return {
      start: t,
      end: t + 5,
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

  function defaultBlurLayer(x, y, w, h) {
    return Object.assign(
      {
        id: window.EditorLayers.nextId(),
        kind: "blur",
        x: x,
        y: y,
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        visible: true,
        blurAmount: blurAmount,
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
      var ends = resolveArrowLocalEnds(layer, w, h);
      var geom = arrowGeometry(ends.x1, ends.y1, ends.x2, ends.y2, sw);
      appendArrowNodes(svg, geom, stroke, sw);
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
    var stroke = layer.stroke || drawStroke || "#ff0000";
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
      var ends = resolveArrowLocalEnds(layer, w, h);
      var geom = arrowGeometry(ends.x1, ends.y1, ends.x2, ends.y2, sw);
      return arrowMarkupFromGeom(geom, stroke, sw);
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
          (path.stroke || drawStroke || "#ff0000") +
          '" stroke-width="' +
          sw +
          '" stroke-linecap="round" stroke-linejoin="round" />'
        );
      })
      .join("");
  }

  function renderBlurPreview(x1, y1, x2, y2) {
    if (!blurPreviewEl) return;
    var x = Math.min(x1, x2);
    var y = Math.min(y1, y2);
    var w = Math.max(0.02, Math.abs(x2 - x1));
    var h = Math.max(0.02, Math.abs(y2 - y1));
    blurPreviewEl.style.left = x * 100 + "%";
    blurPreviewEl.style.top = y * 100 + "%";
    blurPreviewEl.style.width = w * 100 + "%";
    blurPreviewEl.style.height = h * 100 + "%";
    var displayPx =
      window.EditorFrame && window.EditorFrame.blurAmountToDisplayPx
        ? window.EditorFrame.blurAmountToDisplayPx(blurAmount)
        : blurAmount;
    var blur = "blur(" + displayPx + "px)";
    blurPreviewEl.style.backdropFilter = blur;
    blurPreviewEl.style.webkitBackdropFilter = blur;
    blurPreviewEl.hidden = false;
  }

  function renderShapePreview(shape, x1, y1, x2, y2) {
    if (shape === "arrow") {
      renderArrowPreview(x1, y1, x2, y2);
      return;
    }
    var x = Math.min(x1, x2);
    var y = Math.min(y1, y2);
    var w = Math.max(0.02, Math.abs(x2 - x1));
    var h = Math.max(0.02, Math.abs(y2 - y1));
    var frameRect = getFrameRect();
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

  function renderArrowPreview(x1, y1, x2, y2) {
    if (!previewSvg) return;
    var layer = syncArrowBBox({
      kind: "shape",
      shape: "arrow",
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      stroke: drawStroke,
      strokeWidth: drawStrokeWidth,
      fill: "transparent",
    });
    var frameRect = getFrameRect();
    var pxW = Math.max(1, layer.width * frameRect.width);
    var pxH = Math.max(1, layer.height * frameRect.height);
    previewSvg.style.left = layer.x * 100 + "%";
    previewSvg.style.top = layer.y * 100 + "%";
    previewSvg.style.width = layer.width * 100 + "%";
    previewSvg.style.height = layer.height * 100 + "%";
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
    if (shape === "arrow") {
      commitArrow(x1, y1, x2, y2);
      return;
    }
    var x = Math.min(x1, x2);
    var y = Math.min(y1, y2);
    var w = Math.max(0.02, Math.abs(x2 - x1));
    var h = Math.max(0.02, Math.abs(y2 - y1));
    var layer = defaultShapeLayer(shape, x, y, w, h);
    layer = window.EditorFrame.clampLayer(layer);
    if (addLayer) addLayer(layer);
  }

  function commitArrow(x1, y1, x2, y2) {
    if (Math.hypot(x2 - x1, y2 - y1) < 0.005) return;
    var layer = syncArrowBBox(
      Object.assign(defaultShapeLayer("arrow", 0, 0, 0.02, 0.02), {
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        rotation: 0,
      })
    );
    layer = window.EditorFrame.clampLayer(layer);
    if (addLayer) addLayer(layer);
  }

  function commitBlur(x1, y1, x2, y2) {
    var x = Math.min(x1, x2);
    var y = Math.min(y1, y2);
    var w = Math.max(0.02, Math.abs(x2 - x1));
    var h = Math.max(0.02, Math.abs(y2 - y1));
    var layer = defaultBlurLayer(x, y, w, h);
    layer = window.EditorFrame.clampLayer(layer);
    if (addLayer) addLayer(layer);
  }

  function exitInsertTool() {
    setTool(null);
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
    if (e.target.closest("#editorArrowHandles")) return;
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
    if (activeTool === "blur") {
      shapeDrag = {
        kind: "blur",
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
      };
      renderBlurPreview(shapeDrag.x1, shapeDrag.y1, shapeDrag.x2, shapeDrag.y2);
      frameEl.setPointerCapture(e.pointerId);
      frameEl.addEventListener("pointermove", onShapeMove);
      frameEl.addEventListener("pointerup", onShapeUp);
      frameEl.addEventListener("pointercancel", onShapeUp);
      return;
    }
    if (activeTool.indexOf("shape-") === 0) {
      shapeDrag = {
        kind: "shape",
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
    var p = applyShapeDragShift(normFromEvent(e), e.shiftKey);
    shapeDrag.x2 = p.x;
    shapeDrag.y2 = p.y;
    if (shapeDrag.kind === "blur") {
      renderBlurPreview(shapeDrag.x1, shapeDrag.y1, shapeDrag.x2, shapeDrag.y2);
      return;
    }
    renderShapePreview(shapeDrag.shape, shapeDrag.x1, shapeDrag.y1, shapeDrag.x2, shapeDrag.y2);
  }

  function onShapeUp(e) {
    if (!shapeDrag) return;
    frameEl.releasePointerCapture(e.pointerId);
    frameEl.removeEventListener("pointermove", onShapeMove);
    frameEl.removeEventListener("pointerup", onShapeUp);
    frameEl.removeEventListener("pointercancel", onShapeUp);
    var p = applyShapeDragShift(normFromEvent(e), e.shiftKey);
    shapeDrag.x2 = p.x;
    shapeDrag.y2 = p.y;
    if (shapeDrag.kind === "blur") {
      commitBlur(shapeDrag.x1, shapeDrag.y1, shapeDrag.x2, shapeDrag.y2);
    } else {
      commitShape(shapeDrag.shape, shapeDrag.x1, shapeDrag.y1, shapeDrag.x2, shapeDrag.y2);
    }
    shapeDrag = null;
    clearPreview();
    exitInsertTool();
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
    blurPreviewEl = opts.blurPreviewEl;
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
    isArrowLayer: isArrowLayer,
    hasArrowEndpoints: hasArrowEndpoints,
    ensureArrowEndpoints: ensureArrowEndpoints,
    syncArrowBBox: syncArrowBBox,
    snapArrowTip: snapArrowTip,
    setDrawStroke: function (c) {
      if (c != null && String(c).trim()) drawStroke = String(c).trim();
    },
    setDrawStrokeWidth: function (w) {
      drawStrokeWidth = w;
    },
    setShapeFill: function (f, hasColor) {
      var value = f == null ? "transparent" : String(f).trim();
      if (!value) value = "transparent";
      shapeFill = value;
      shapeFillHasColor =
        hasColor == null ? fillHasColor(value) : !!hasColor && fillHasColor(value);
      if (!shapeFillHasColor) shapeFill = "transparent";
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
    setBlurAmount: function (amount) {
      var v = parseInt(amount, 10);
      if (isFinite(v) && v >= 1) blurAmount = v;
    },
    getBlurAmount: function () {
      return blurAmount;
    },
  };
})();
