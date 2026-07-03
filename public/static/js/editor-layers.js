(function () {
  "use strict";

  var overlayEl = null;
  var listEl = null;
  var emptyEl = null;
  var getState = null;
  var selectLayer = null;
  var updateLayer = null;
  var deleteLayer = null;
  var moveLayerZ = null;
  var isLayerVisibleOnFrame = null;
  var getCurrentTime = null;
  var isMainVideoPlaying = null;

  var layerIdCounter = 0;

  var TEXT_PLACEHOLDER = "Nhập nội dung...";

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

  function defaultTiming(currentTime, duration) {
    var start = currentTime || 0;
    var end = Math.min(start + 5, duration || 10);
    return { start: start, end: end, alwaysVisible: false };
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
        x: 0.15,
        y: 0.15,
        width: 0.35,
        height: 0.35,
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
    if (layer.kind === "text") {
      if (isPlaceholderText(layer.text)) return "Text (placeholder)";
      return layer.text;
    }
    if (layer.kind === "image") return "Image";
    if (layer.kind === "video") return "Video";
    return layer.kind;
  }

  function syncVideoLayerPlayback(el, layer, visible, currentTime) {
    var vid = el.querySelector("video");
    if (!vid) return;
    if (!visible) {
      vid.pause();
      return;
    }
    var offset = Math.max(0, currentTime - (layer.start || 0));
    if (Math.abs(vid.currentTime - offset) > 0.15) {
      vid.currentTime = offset;
    }
    if (isMainVideoPlaying && isMainVideoPlaying()) {
      if (vid.paused) vid.play().catch(function () {});
    } else {
      vid.pause();
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
    if (layer.kind === "video") {
      syncVideoLayerPlayback(el, layer, visible, currentTime);
    }
    return visible;
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
    }
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

    if (layer.kind === "text") {
      applyTextLayerStyles(el, layer);
    } else if (layer.kind === "image") {
      var img = document.createElement("img");
      img.src = layer.src || "";
      img.alt = "";
      img.draggable = false;
      el.appendChild(img);
    } else if (layer.kind === "video") {
      var vid = document.createElement("video");
      vid.src = layer.src || "";
      vid.muted = layer.muted !== false;
      vid.playsInline = true;
      vid.loop = !!layer.loop;
      vid.draggable = false;
      el.appendChild(vid);
    }

    applyLayerFrameVisibility(
      el,
      layer,
      getCurrentTime ? getCurrentTime() : 0
    );

    el.addEventListener("pointerdown", function (e) {
      window.EditorTransform.onLayerPointerDown(e, layer.id);
    });

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
    if (selected && layerFrameVisible(selected)) {
      window.EditorTransform.syncTransformBox(selected);
    } else {
      window.EditorTransform.syncTransformBox(null);
    }
  }

  function renderPanel() {
    if (!listEl || !emptyEl || !getState) return;
    var state = getState();
    var layers = state.layers.slice().sort(function (a, b) {
      return (b.zIndex || 0) - (a.zIndex || 0);
    });

    listEl.innerHTML = "";
    if (layers.length === 0) {
      listEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }
    listEl.hidden = false;
    emptyEl.hidden = true;

    layers.forEach(function (layer) {
      var li = document.createElement("li");
      li.className =
        "editor-layer-row" +
        (state.selectedId === layer.id ? " editor-layer-row--selected" : "");
      li.dataset.layerId = layer.id;

      var label = document.createElement("span");
      label.className = "editor-layer-row__label";
      label.textContent = layerLabel(layer);

      var kind = document.createElement("span");
      kind.className = "editor-layer-row__kind";
      kind.textContent = layer.kind;

      var actions = document.createElement("div");
      actions.className = "editor-layer-row__actions";

      var visBtn = document.createElement("button");
      visBtn.type = "button";
      visBtn.className = "btn btn--icon btn--sm";
      visBtn.title = layer.visible ? "Ẩn" : "Hiện";
      visBtn.innerHTML = layer.visible ? "👁" : "🚫";
      visBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var current = getState().layers.find(function (l) {
          return l.id === layer.id;
        });
        updateLayer(layer.id, { visible: !(current && current.visible) });
      });

      var upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "btn btn--icon btn--sm";
      upBtn.title = "Lên trên";
      upBtn.textContent = "↑";
      upBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        moveLayerZ(layer.id, 1);
      });

      var downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "btn btn--icon btn--sm";
      downBtn.title = "Xuống dưới";
      downBtn.textContent = "↓";
      downBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        moveLayerZ(layer.id, -1);
      });

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--icon btn--sm";
      delBtn.title = "Xóa";
      delBtn.textContent = "×";
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteLayer(layer.id);
      });

      actions.appendChild(visBtn);
      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(delBtn);

      li.appendChild(label);
      li.appendChild(kind);
      li.appendChild(actions);

      li.addEventListener("click", function () {
        selectLayer(layer.id);
      });

      listEl.appendChild(li);
    });
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
    var selected = selectedId
      ? getState().layers.find(function (l) {
          return l.id === selectedId;
        })
      : null;
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
    moveLayerZ = opts.moveLayerZ;
    isLayerVisibleOnFrame = opts.isLayerVisibleOnFrame;
    getCurrentTime = opts.getCurrentTime;
    isMainVideoPlaying = opts.isMainVideoPlaying;
  }

  window.EditorLayers = {
    init: init,
    render: render,
    updateSelection: updateSelection,
    updateVisibilityForTime: updateVisibilityForTime,
    patchLayerDOM: patchLayerDOM,
    patchLayerRowLabel: patchLayerRowLabel,
    patchLayer: patchLayer,
    defaultTextLayer: defaultTextLayer,
    defaultImageLayer: defaultImageLayer,
    defaultVideoLayer: defaultVideoLayer,
    nextId: nextId,
    TEXT_PLACEHOLDER: TEXT_PLACEHOLDER,
    isPlaceholderText: isPlaceholderText,
  };
})();
