(function () {
  "use strict";

  var overlayEl = null;
  var listEl = null;
  var emptyEl = null;
  var getState = null;
  var selectLayer = null;
  var updateLayer = null;
  var deleteLayer = null;
  var duplicateLayer = null;
  var reorderLayers = null;
  var isLayerVisibleOnFrame = null;
  var getCurrentTime = null;
  var isTimelinePlaying = null;
  var menuListenersBound = false;

  var layerIdCounter = 0;
  var panelDrag = null;
  var dropIndicator = null;
  var DRAG_THRESHOLD_PX = 4;

  var TEXT_PLACEHOLDER = "Nhập nội dung...";
  var BOUND_LAYER_ID = "__bound__";

  var ICON_ATTRS =
    'class="editor-layer-row__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  var ICON_EYE =
    "<svg " + ICON_ATTRS + ">" +
    '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>' +
    '<circle cx="12" cy="12" r="3"/>' +
    "</svg>";

  var ICON_EYE_OFF =
    "<svg " + ICON_ATTRS + ">" +
    '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>' +
    '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>' +
    '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>' +
    '<path d="m2 2 20 20"/>' +
    "</svg>";

  var ICON_MORE =
    "<svg " + ICON_ATTRS + ">" +
    '<circle cx="12" cy="12" r="1"/>' +
    '<circle cx="12" cy="5" r="1"/>' +
    '<circle cx="12" cy="19" r="1"/>' +
    "</svg>";

  var ICON_COPY =
    "<svg " + ICON_ATTRS + ">" +
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>' +
    "</svg>";

  var ICON_TRASH =
    "<svg " + ICON_ATTRS + ">" +
    '<path d="M3 6h18"/>' +
    '<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>' +
    '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>' +
    '<line x1="10" x2="10" y1="11" y2="17"/>' +
    '<line x1="14" x2="14" y1="11" y2="17"/>' +
    "</svg>";

  var ICON_GRIP =
    "<svg " + ICON_ATTRS + ">" +
    '<circle cx="9" cy="12" r="1"/>' +
    '<circle cx="9" cy="5" r="1"/>' +
    '<circle cx="9" cy="19" r="1"/>' +
    '<circle cx="15" cy="12" r="1"/>' +
    '<circle cx="15" cy="5" r="1"/>' +
    '<circle cx="15" cy="19" r="1"/>' +
    "</svg>";

  var ICON_FRAME =
    "<svg " + ICON_ATTRS + ">" +
    '<line x1="22" x2="2" y1="6" y2="6"/>' +
    '<line x1="22" x2="2" y1="18" y2="18"/>' +
    '<line x1="6" x2="6" y1="2" y2="22"/>' +
    '<line x1="18" x2="18" y1="2" y2="22"/>' +
    "</svg>";

  function isPlaceholderText(text) {
    return !text || text === TEXT_PLACEHOLDER;
  }

  function displayText(layer) {
    if (isPlaceholderText(layer.text)) return TEXT_PLACEHOLDER;
    return layer.text;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function nextId() {
    layerIdCounter += 1;
    return "layer-" + layerIdCounter;
  }

  function syncIdCounterFromLayers(layers) {
    var max = layerIdCounter;
    (layers || []).forEach(function (layer) {
      if (!layer || typeof layer.id !== "string") return;
      var match = /^layer-(\d+)$/.exec(layer.id);
      if (!match) return;
      var n = parseInt(match[1], 10);
      if (n > max) max = n;
    });
    layerIdCounter = max;
  }

  function resetIdCounter() {
    layerIdCounter = 0;
  }

  function defaultTiming(currentTime, duration) {
    var start = currentTime || 0;
    return { start: start, end: start + 5, alwaysVisible: false };
  }

  function isBoundLayer(layer) {
    return layer && (layer.kind === "bound" || layer.id === BOUND_LAYER_ID);
  }

  function defaultBoundLayer() {
    return {
      id: BOUND_LAYER_ID,
      kind: "bound",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      visible: true,
      alwaysVisible: true,
    };
  }

  function defaultTextLayer(currentTime, duration) {
    var timing = defaultTiming(currentTime, duration);
    return Object.assign(
      {
        id: nextId(),
        kind: "text",
        x: 0.2,
        y: 0.8,
        width: 0.6,
        height: 0.12,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        visible: true,
        text: TEXT_PLACEHOLDER,
        fontSize: 28,
        color: "#ffffff",
        bgColor: "rgba(0,0,0,0.5)",
      },
      timing
    );
  }

  function defaultImageLayer(src, currentTime, duration) {
    return Object.assign(
      {
        id: nextId(),
        kind: "image",
        x: 0.05,
        y: 0.85,
        width: 0.1,
        height: 0.1,
        rotation: 0,
        opacity: 0.8,
        zIndex: 1,
        visible: true,
        src: src,
      },
      defaultTiming(currentTime, duration)
    );
  }

  function defaultVideoLayer(src, currentTime, duration) {
    return Object.assign(
      {
        id: nextId(),
        kind: "video",
        x: 0.1,
        y: 0.1,
        width: 0.8,
        height: 0.8,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        visible: true,
        src: src,
        muted: true,
        loop: false,
      },
      defaultTiming(currentTime, duration)
    );
  }

  function layerLabel(layer) {
    if (layer.kind === "bound") return "Frame bound";
    if (layer.kind === "text") {
      if (isPlaceholderText(layer.text)) return "Text (placeholder)";
      return layer.text;
    }
    if (layer.kind === "image") return "Image";
    if (layer.kind === "video") return "Video";
    if (layer.kind === "shape") return "Shape (" + (layer.shape || "rect") + ")";
    if (layer.kind === "draw") return "Drawing";
    if (layer.kind === "blur") return "Blur";
    return layer.kind;
  }

  function layerMediaSrc(layer) {
    return layer.src || layer.mediaUrl || "";
  }

  function shouldRenderMediaElement(layer) {
    if (!layer.fileId) return true;
    return !!layerMediaSrc(layer) || layer.mediaState === "ready";
  }

  function syncImageLayerMedia(el, layer, visible) {
    if (!visible) return;
    if (layer.fileId && layer.mediaState !== "ready" && window.EditorMedia) {
      window.EditorMedia.ensureLayerMedia(layer);
    }
    var img = el.querySelector("img");
    var src = layerMediaSrc(layer);
    if (!img || !src) return;
    if (img.getAttribute("src") !== src) {
      img.src = src;
    }
  }

  function syncVideoLayerPlayback(el, layer, visible, currentTime) {
    if (!visible) {
      var hiddenVid = el.querySelector("video");
      if (hiddenVid) hiddenVid.pause();
      return;
    }
    if (layer.fileId && layer.mediaState !== "ready" && window.EditorMedia) {
      window.EditorMedia.ensureLayerMedia(layer);
    }
    var vid = el.querySelector("video");
    if (!vid) return;
    var src = layerMediaSrc(layer);
    if (src && vid.getAttribute("src") !== src) {
      vid.src = src;
    }
    var offset = Math.max(0, currentTime - (layer.start || 0));
    function applyTime() {
      if (Math.abs(vid.currentTime - offset) > 0.15) {
        vid.currentTime = offset;
      }
      if (isTimelinePlaying && isTimelinePlaying()) {
        if (vid.paused) vid.play().catch(function () {});
      } else {
        vid.pause();
      }
    }
    if (vid.readyState >= 1) {
      applyTime();
    } else {
      vid.addEventListener("loadedmetadata", applyTime, { once: true });
    }
  }

  function layerFrameVisible(layer) {
    if (!layer.visible) return false;
    if (!isLayerVisibleOnFrame) return true;
    return isLayerVisibleOnFrame(layer);
  }

  function applyLayerFrameVisibility(el, layer, currentTime) {
    var visible = layerFrameVisible(layer);
    el.hidden = !visible;
    el.classList.toggle("editor-layer--frame-hidden", !visible);
    el.setAttribute("aria-hidden", visible ? "false" : "true");
    if (layer.kind === "image") {
      syncImageLayerMedia(el, layer, visible);
    } else if (layer.kind === "video") {
      syncVideoLayerPlayback(el, layer, visible, currentTime);
    }
    return visible;
  }

  function patchLayerMediaDOM(el, layer) {
    if (layer.kind !== "image" && layer.kind !== "video") return;
    var src = layerMediaSrc(layer);
    if (!src) return;

    var placeholder = el.querySelector(".editor-layer__media-placeholder");
    if (placeholder) {
      placeholder.remove();
    }

    if (layer.kind === "image") {
      var img = el.querySelector("img");
      if (!img) {
        img = document.createElement("img");
        img.alt = "";
        img.draggable = false;
        el.appendChild(img);
      }
      if (img.getAttribute("src") !== src) {
        img.src = src;
      }
      return;
    }

    var vid = el.querySelector("video");
    if (!vid) {
      vid = document.createElement("video");
      vid.muted = layer.muted !== false;
      vid.playsInline = true;
      vid.loop = !!layer.loop;
      vid.preload = layer.fileId ? "metadata" : "auto";
      vid.draggable = false;
      el.appendChild(vid);
    }
    if (vid.getAttribute("src") !== src) {
      vid.src = src;
    }
  }

  function applyTextLayerStyles(el, layer) {
    var isPlaceholder = isPlaceholderText(layer.text);
    el.textContent = displayText(layer);
    el.style.color = layer.color || "#fff";
    el.style.fontSize = (layer.fontSize || 28) + "px";
    el.style.fontWeight = "600";
    if (layer.bgColor) {
      el.style.background = layer.bgColor;
      el.style.borderRadius = "4px";
    } else {
      el.style.background = "";
      el.style.textShadow = "0 1px 3px rgba(0,0,0,0.6)";
    }
    el.classList.toggle("editor-layer--placeholder", isPlaceholder);
  }

  function patchLayerDOM(layer) {
    if (!overlayEl) return;
    var el = overlayEl.querySelector('[data-layer-id="' + layer.id + '"]');
    if (!el) return;
    applyLayerFrameVisibility(
      el,
      layer,
      getCurrentTime ? getCurrentTime() : 0
    );
    el.style.left = layer.x * 100 + "%";
    el.style.top = layer.y * 100 + "%";
    el.style.width = layer.width * 100 + "%";
    el.style.height = layer.height * 100 + "%";
    el.style.transform = "rotate(" + (layer.rotation || 0) + "deg)";
    el.style.opacity = layer.opacity != null ? layer.opacity : 1;
    if (layer.kind === "text") {
      applyTextLayerStyles(el, layer);
    } else if (layer.kind === "image" || layer.kind === "video") {
      patchLayerMediaDOM(el, layer);
    } else if (layer.kind === "shape" || layer.kind === "draw") {
      patchShapeDrawDOM(el, layer);
    } else if (layer.kind === "blur") {
      patchBlurDOM(el, layer);
    }
  }

  function layerPixelSize(layer) {
    var frameRect =
      window.EditorFrame && window.EditorFrame.getFrameRect
        ? window.EditorFrame.getFrameRect()
        : { width: 1, height: 1 };
    return {
      w: Math.max(1, (layer.width || 0.1) * frameRect.width),
      h: Math.max(1, (layer.height || 0.1) * frameRect.height),
    };
  }

  function patchBlurDOM(el, layer) {
    var amount = layer.blurAmount != null ? layer.blurAmount : 12;
    var displayPx =
      window.EditorFrame && window.EditorFrame.blurAmountToDisplayPx
        ? window.EditorFrame.blurAmountToDisplayPx(amount)
        : amount;
    var blur = "blur(" + displayPx + "px)";
    el.style.backdropFilter = blur;
    el.style.webkitBackdropFilter = blur;
  }

  function patchShapeDrawDOM(el, layer) {
    var svg = el.querySelector("svg");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("editor-layer__svg");
      el.appendChild(svg);
    }
    var px = layerPixelSize(layer);
    svg.setAttribute("viewBox", "0 0 " + px.w + " " + px.h);
    svg.setAttribute("preserveAspectRatio", "none");
    if (layer.kind === "shape" && window.EditorDraw && window.EditorDraw.paintShapeLayer) {
      window.EditorDraw.paintShapeLayer(svg, layer, px.w, px.h);
    } else if (layer.kind === "draw" && window.EditorDraw && window.EditorDraw.paintDrawLayer) {
      window.EditorDraw.paintDrawLayer(svg, layer, px.w, px.h);
    }
  }

  function repatchShapeLayers() {
    if (!overlayEl || !getState) return;
    getState().layers.forEach(function (layer) {
      if (layer.kind !== "shape" && layer.kind !== "draw") return;
      var el = overlayEl.querySelector('[data-layer-id="' + layer.id + '"]');
      if (el) patchShapeDrawDOM(el, layer);
    });
  }

  function repatchBlurLayers() {
    if (!overlayEl || !getState) return;
    getState().layers.forEach(function (layer) {
      if (layer.kind !== "blur") return;
      var el = overlayEl.querySelector('[data-layer-id="' + layer.id + '"]');
      if (el) patchBlurDOM(el, layer);
    });
  }

  function patchLayer(id, changes, getLayerFromState) {
    var layer = getLayerFromState();
    if (!layer || layer.id !== id) return null;
    var merged = window.EditorFrame.clampLayer(Object.assign({}, layer, changes));
    patchLayerDOM(merged);
    return merged;
  }

  function renderLayerEl(layer) {
    var el = document.createElement("div");
    el.className =
      "editor-layer editor-layer--" +
      layer.kind +
      (getState().selectedId === layer.id ? " editor-layer--selected" : "");
    el.dataset.layerId = layer.id;
    el.style.left = layer.x * 100 + "%";
    el.style.top = layer.y * 100 + "%";
    el.style.width = layer.width * 100 + "%";
    el.style.height = layer.height * 100 + "%";
    el.style.transform = "rotate(" + (layer.rotation || 0) + "deg)";
    el.style.opacity = layer.opacity != null ? layer.opacity : 1;
    el.style.zIndex = layer.zIndex || 1;

    if (layer.kind === "bound") {
      el.classList.add("editor-layer--bound");
      el.setAttribute("aria-label", "Frame bound");
    } else if (layer.kind === "text") {
      applyTextLayerStyles(el, layer);
    } else if (layer.kind === "image") {
      if (!shouldRenderMediaElement(layer)) {
        var imgPh = document.createElement("div");
        imgPh.className = "editor-layer__media-placeholder";
        imgPh.textContent = layer.mediaState === "loading" ? "Đang tải…" : "Ảnh";
        el.appendChild(imgPh);
      } else {
        var img = document.createElement("img");
        img.src = layerMediaSrc(layer);
        img.alt = "";
        img.draggable = false;
        el.appendChild(img);
      }
    } else if (layer.kind === "video") {
      if (!shouldRenderMediaElement(layer)) {
        var vidPh = document.createElement("div");
        vidPh.className = "editor-layer__media-placeholder";
        vidPh.textContent = layer.mediaState === "loading" ? "Đang tải…" : "Video";
        el.appendChild(vidPh);
      } else {
        var vid = document.createElement("video");
        vid.src = layerMediaSrc(layer);
        vid.muted = layer.muted !== false;
        vid.playsInline = true;
        vid.loop = !!layer.loop;
        vid.preload = layer.fileId ? "metadata" : "auto";
        vid.draggable = false;
        el.appendChild(vid);
      }
    } else if (layer.kind === "shape" || layer.kind === "draw") {
      patchShapeDrawDOM(el, layer);
    } else if (layer.kind === "blur") {
      patchBlurDOM(el, layer);
    }

    applyLayerFrameVisibility(
      el,
      layer,
      getCurrentTime ? getCurrentTime() : 0
    );

    if (!isBoundLayer(layer)) {
      el.addEventListener("pointerdown", function (e) {
        if (window.EditorDraw && window.EditorDraw.isToolActive()) return;
        window.EditorTransform.onLayerPointerDown(e, layer.id);
      });
    }

    return el;
  }

  function renderOverlay() {
    if (!overlayEl || !getState) return;
    var state = getState();
    overlayEl.innerHTML = "";
    var sorted = state.layers.slice().sort(function (a, b) {
      return (a.zIndex || 0) - (b.zIndex || 0);
    });
    sorted.forEach(function (layer) {
      overlayEl.appendChild(renderLayerEl(layer));
    });

    syncTransformBoxForSelection(state);
  }

  function updateVisibilityForTime(currentTime) {
    if (window.EditorMedia) {
      window.EditorMedia.onTimeUpdate(currentTime);
    }
    if (!overlayEl || !getState) return;
    var state = getState();
    overlayEl.querySelectorAll(".editor-layer").forEach(function (el) {
      var layer = state.layers.find(function (l) {
        return l.id === el.dataset.layerId;
      });
      if (!layer) return;
      applyLayerFrameVisibility(el, layer, currentTime);
    });

    syncTransformBoxForSelection(state);
  }

  function syncTransformBoxForSelection(state) {
    var selected = state.layers.find(function (l) {
      return l.id === state.selectedId;
    });
    if (selected && layerFrameVisible(selected) && !isBoundLayer(selected)) {
      window.EditorTransform.syncTransformBox(selected);
    } else {
      window.EditorTransform.syncTransformBox(null);
    }
  }

  function getPanelOrderedIds() {
    if (!listEl) return [];
    return Array.prototype.slice
      .call(listEl.querySelectorAll(".editor-layer-row[data-layer-id]"))
      .map(function (el) {
        return el.dataset.layerId;
      });
  }

  function findDropIndex(clientY) {
    var rows = listEl.querySelectorAll(".editor-layer-row[data-layer-id]");
    for (var i = 0; i < rows.length; i++) {
      var rect = rows[i].getBoundingClientRect();
      var mid = rect.top + rect.height / 2;
      if (clientY < mid) return i;
    }
    return rows.length;
  }

  function showDropIndicator(index) {
    if (!dropIndicator) {
      dropIndicator = document.createElement("li");
      dropIndicator.className = "editor-layer-row__drop-indicator";
      dropIndicator.setAttribute("aria-hidden", "true");
    }
    var rows = listEl.querySelectorAll(".editor-layer-row[data-layer-id]");
    if (index >= rows.length) {
      if (rows.length) {
        rows[rows.length - 1].after(dropIndicator);
      } else {
        listEl.appendChild(dropIndicator);
      }
    } else if (rows[index]) {
      rows[index].before(dropIndicator);
    }
  }

  function hideDropIndicator() {
    if (dropIndicator && dropIndicator.parentNode) {
      dropIndicator.parentNode.removeChild(dropIndicator);
    }
  }

  function onPanelDragMove(e) {
    if (!panelDrag || !panelDrag.moved) return;
    var dropIdx = findDropIndex(e.clientY);
    showDropIndicator(dropIdx);
    panelDrag.dropIndex = dropIdx;
  }

  function onPanelDragEnd(e) {
    if (!panelDrag) return;
    listEl.releasePointerCapture(e.pointerId);
    listEl.removeEventListener("pointermove", onPanelDragMove);
    listEl.removeEventListener("pointerup", onPanelDragEnd);
    listEl.removeEventListener("pointercancel", onPanelDragEnd);
    hideDropIndicator();
    if (panelDrag.moved && panelDrag.dropIndex != null && reorderLayers) {
      var ids = getPanelOrderedIds();
      var from = ids.indexOf(panelDrag.layerId);
      if (from >= 0) {
        ids.splice(from, 1);
        var to = panelDrag.dropIndex;
        if (from < to) to -= 1;
        ids.splice(to, 0, panelDrag.layerId);
        reorderLayers(ids);
      }
    }
    if (panelDrag.rowEl) {
      panelDrag.rowEl.classList.remove("editor-layer-row--dragging");
    }
    panelDrag = null;
  }

  function onDragHandlePointerDown(e, layerId, rowEl) {
    e.preventDefault();
    e.stopPropagation();
    panelDrag = {
      layerId: layerId,
      rowEl: rowEl,
      startY: e.clientY,
      moved: false,
      dropIndex: null,
    };
    listEl.setPointerCapture(e.pointerId);
    listEl.addEventListener("pointermove", function move(e) {
      if (!panelDrag) return;
      if (
        !panelDrag.moved &&
        Math.abs(e.clientY - panelDrag.startY) > DRAG_THRESHOLD_PX
      ) {
        panelDrag.moved = true;
        rowEl.classList.add("editor-layer-row--dragging");
      }
      if (panelDrag.moved) onPanelDragMove(e);
    });
    listEl.addEventListener("pointerup", onPanelDragEnd);
    listEl.addEventListener("pointercancel", onPanelDragEnd);
  }

  function closeAllLayerMenus() {
    if (!listEl) return;
    listEl.querySelectorAll(".editor-layer-row__more").forEach(function (wrap) {
      var menu = wrap.querySelector(".editor-layer-row__menu");
      var btn = wrap.querySelector(".editor-layer-row__action--more");
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function createMenuItem(label, iconHtml, onClick) {
    var item = document.createElement("button");
    item.type = "button";
    item.className = "editor-layer-row__menu-item";
    item.setAttribute("role", "menuitem");
    item.innerHTML =
      iconHtml + '<span class="editor-layer-row__menu-label">' + label + "</span>";
    item.addEventListener("click", function (e) {
      e.stopPropagation();
      closeAllLayerMenus();
      if (onClick) onClick();
    });
    return item;
  }

  function createMoreMenu(layerId) {
    var wrap = document.createElement("div");
    wrap.className = "editor-layer-row__more";

    var moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "editor-layer-row__action editor-layer-row__action--more";
    moreBtn.title = "Thêm";
    moreBtn.setAttribute("aria-label", "Thêm");
    moreBtn.setAttribute("aria-haspopup", "menu");
    moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.innerHTML = ICON_MORE;

    var menu = document.createElement("div");
    menu.className = "editor-layer-row__menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    var dupItem = createMenuItem("Nhân bản", ICON_COPY, function () {
      if (duplicateLayer) duplicateLayer(layerId);
    });
    var delItem = createMenuItem("Xóa", ICON_TRASH, function () {
      if (deleteLayer) deleteLayer(layerId);
    });

    moreBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var wasOpen = !menu.hidden;
      closeAllLayerMenus();
      if (!wasOpen) {
        menu.hidden = false;
        moreBtn.setAttribute("aria-expanded", "true");
      }
    });

    menu.appendChild(dupItem);
    menu.appendChild(delItem);
    wrap.appendChild(moreBtn);
    wrap.appendChild(menu);
    return wrap;
  }

  function bindMenuListeners() {
    if (menuListenersBound) return;
    menuListenersBound = true;
    document.addEventListener("click", function (e) {
      if (e.target.closest(".editor-layer-row__more")) return;
      closeAllLayerMenus();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAllLayerMenus();
    });
  }

  function renderPanel() {
    if (!listEl || !emptyEl || !getState) return;
    var state = getState();
    var layers = state.layers.slice().sort(function (a, b) {
      return (b.zIndex || 0) - (a.zIndex || 0);
    });

    listEl.innerHTML = "";
    hideDropIndicator();

    layers.forEach(function (layer) {
      var li = document.createElement("li");
      li.className =
        "editor-layer-row" +
        (isBoundLayer(layer) ? " editor-layer-row--bound" : "") +
        (state.selectedId === layer.id ? " editor-layer-row--selected" : "");
      li.dataset.layerId = layer.id;

      var handle = document.createElement("span");
      handle.className = "editor-layer-row__drag-handle";
      handle.title = isBoundLayer(layer) ? "" : "Kéo để sắp xếp";
      handle.innerHTML = isBoundLayer(layer) ? ICON_FRAME : ICON_GRIP;
      if (!isBoundLayer(layer)) {
        handle.addEventListener("pointerdown", function (e) {
          closeAllLayerMenus();
          onDragHandlePointerDown(e, layer.id, li);
        });
      }

      var label = document.createElement("span");
      label.className = "editor-layer-row__label";
      label.textContent = layerLabel(layer);

      var kind = document.createElement("span");
      kind.className = "editor-layer-row__kind";
      kind.textContent = layer.kind;

      var actions = document.createElement("div");
      actions.className = "editor-layer-row__actions";

      var visLabel = layer.visible ? "Ẩn" : "Hiện";
      var visBtn = document.createElement("button");
      visBtn.type = "button";
      visBtn.className = "editor-layer-row__action";
      visBtn.title = visLabel;
      visBtn.setAttribute("aria-label", visLabel);
      visBtn.innerHTML = layer.visible ? ICON_EYE : ICON_EYE_OFF;
      visBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeAllLayerMenus();
        var current = getState().layers.find(function (l) {
          return l.id === layer.id;
        });
        updateLayer(layer.id, { visible: !(current && current.visible) });
      });

      actions.appendChild(visBtn);
      if (!isBoundLayer(layer)) {
        actions.appendChild(createMoreMenu(layer.id));
      }

      li.appendChild(handle);
      li.appendChild(label);
      li.appendChild(kind);
      li.appendChild(actions);

      li.addEventListener("click", function (e) {
        if (e.target.closest(".editor-layer-row__drag-handle")) return;
        if (e.target.closest(".editor-layer-row__actions")) return;
        selectLayer(layer.id);
      });

      listEl.appendChild(li);
    });

    if (layers.length === 0) {
      emptyEl.hidden = false;
      listEl.hidden = true;
    } else {
      emptyEl.hidden = true;
      listEl.hidden = false;
    }
  }

  function patchLayerRowLabel(layer) {
    if (!listEl || !layer) return;
    var row = listEl.querySelector('[data-layer-id="' + layer.id + '"]');
    if (!row) return;
    var label = row.querySelector(".editor-layer-row__label");
    if (label) label.textContent = layerLabel(layer);
  }

  function updateSelection(selectedId) {
    if (overlayEl) {
      overlayEl.querySelectorAll(".editor-layer").forEach(function (el) {
        el.classList.toggle(
          "editor-layer--selected",
          el.dataset.layerId === selectedId
        );
      });
    }
    if (listEl) {
      listEl.querySelectorAll(".editor-layer-row").forEach(function (el) {
        el.classList.toggle(
          "editor-layer-row--selected",
          el.dataset.layerId === selectedId
        );
      });
    }
    syncTransformBoxForSelection({
      selectedId: selectedId,
      layers: getState().layers,
    });
  }

  function render() {
    renderOverlay();
    renderPanel();
  }

  function getMaxZIndex(layers) {
    var max = 0;
    layers.forEach(function (l) {
      if ((l.zIndex || 0) > max) max = l.zIndex || 0;
    });
    return max;
  }

  function init(opts) {
    overlayEl = opts.overlayEl;
    listEl = opts.listEl;
    emptyEl = opts.emptyEl;
    getState = opts.getState;
    selectLayer = opts.selectLayer;
    updateLayer = opts.updateLayer;
    deleteLayer = opts.deleteLayer;
    duplicateLayer = opts.duplicateLayer;
    reorderLayers = opts.reorderLayers;
    isLayerVisibleOnFrame = opts.isLayerVisibleOnFrame;
    getCurrentTime = opts.getCurrentTime;
    isTimelinePlaying = opts.isTimelinePlaying;
    bindMenuListeners();
  }

  window.EditorLayers = {
    init: init,
    render: render,
    updateSelection: updateSelection,
    updateVisibilityForTime: updateVisibilityForTime,
    patchLayerDOM: patchLayerDOM,
    patchLayerRowLabel: patchLayerRowLabel,
    patchLayer: patchLayer,
    defaultBoundLayer: defaultBoundLayer,
    defaultTextLayer: defaultTextLayer,
    defaultImageLayer: defaultImageLayer,
    defaultVideoLayer: defaultVideoLayer,
    isBoundLayer: isBoundLayer,
    BOUND_LAYER_ID: BOUND_LAYER_ID,
    repatchShapeLayers: repatchShapeLayers,
    repatchBlurLayers: repatchBlurLayers,
    nextId: nextId,
    syncIdCounterFromLayers: syncIdCounterFromLayers,
    resetIdCounter: resetIdCounter,
    TEXT_PLACEHOLDER: TEXT_PLACEHOLDER,
    isPlaceholderText: isPlaceholderText,
  };
})();
