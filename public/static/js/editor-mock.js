(function () {
  "use strict";

  var state = {
    frame: { width: 1920, height: 1080 },
    framePreset: "original",
    videoSource: { width: 1920, height: 1080, name: "", duration: 0 },
    videoTransform: { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1 },
    video: { name: "", duration: 0 },
    layers: [],
    selectedId: null,
    currentTime: 0,
  };

  var videoEl = null;
  var videoUrl = null;
  var listeners = [];

  function $(id) {
    return document.getElementById(id);
  }

  function isPropertiesFocused() {
    var panel = $("editorProperties");
    if (!panel) return false;
    var active = document.activeElement;
    return (
      active &&
      panel.contains(active) &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT")
    );
  }

  function refreshUI() {
    window.EditorLayers.render();
    window.EditorCaptions.renderCaptionTracks();
    if (!isPropertiesFocused()) {
      renderProperties();
    }
  }

  function notify() {
    listeners.forEach(function (fn) {
      fn(state);
    });
    updateMetaDisplay();
    refreshUI();
  }

  function getState() {
    return state;
  }

  function getSelectedLayer() {
    if (state.selectedId === "__video__") {
      return Object.assign({ id: "__video__" }, state.videoTransform);
    }
    if (!state.selectedId) return null;
    return (
      state.layers.find(function (l) {
        return l.id === state.selectedId;
      }) || null
    );
  }

  function syncVideoLayerSelection() {
    var videoLayerEl = $("editorVideoLayer");
    if (videoLayerEl) {
      videoLayerEl.classList.toggle(
        "editor-video-layer--selected",
        state.selectedId === "__video__"
      );
    }
  }

  function selectLayer(id, opts) {
    state.selectedId = id;
    syncVideoLayerSelection();
    if (opts && opts.silent) {
      window.EditorLayers.updateSelection(id);
      renderProperties();
      var layer = getSelectedLayer();
      if (layer) window.EditorTransform.syncTransformBox(layer);
      else window.EditorTransform.syncTransformBox(null);
      return;
    }
    notify();
    var layer = getSelectedLayer();
    if (layer) window.EditorTransform.syncTransformBox(layer);
    else window.EditorTransform.syncTransformBox(null);
  }

  function deselectAll() {
    state.selectedId = null;
    syncVideoLayerSelection();
    notify();
    window.EditorTransform.syncTransformBox(null);
  }

  function updateVideoTransform(changes, opts) {
    var merged = window.EditorFrame.clampVideoTransform(
      Object.assign({}, state.videoTransform, changes)
    );
    state.videoTransform = merged;
    window.EditorFrame.applyVideoTransform(merged);
    if (opts && opts.live) {
      if (state.selectedId === "__video__") {
        window.EditorTransform.syncTransformBox(getSelectedLayer());
      }
      return;
    }
    notify();
  }

  function updateLayer(id, changes, opts) {
    if (id === "__video__") {
      updateVideoTransform(changes, opts);
      return;
    }
    var idx = state.layers.findIndex(function (l) {
      return l.id === id;
    });
    if (idx < 0) return;
    var merged = Object.assign({}, state.layers[idx], changes);
    if (changes.x !== undefined || changes.y !== undefined || changes.width !== undefined || changes.height !== undefined) {
      merged = window.EditorFrame.clampLayer(merged);
    }
    state.layers[idx] = merged;
    if (opts && opts.live) {
      window.EditorLayers.patchLayerDOM(merged);
      window.EditorLayers.patchLayerRowLabel(merged);
      if (state.selectedId === id) {
        if (changes.visible !== undefined || changes.start !== undefined || changes.end !== undefined || changes.alwaysVisible !== undefined) {
          window.EditorLayers.updateVisibilityForTime(state.currentTime);
        } else {
          window.EditorTransform.syncTransformBox(merged);
        }
      }
      return;
    }
    notify();
  }

  function deleteLayer(id) {
    var layer = state.layers.find(function (l) {
      return l.id === id;
    });
    revokeLayerResources(layer);
    state.layers = state.layers.filter(function (l) {
      return l.id !== id;
    });
    if (state.selectedId === id) state.selectedId = null;
    notify();
  }

  function addVideoLayerFromFile(file) {
    var url = URL.createObjectURL(file);
    var t = videoEl ? videoEl.currentTime : state.currentTime;
    addLayer(window.EditorLayers.defaultVideoLayer(url, t, state.video.duration));
  }

  function addLayer(layer) {
    var maxZ = 0;
    state.layers.forEach(function (l) {
      if ((l.zIndex || 0) > maxZ) maxZ = l.zIndex || 0;
    });
    layer.zIndex = maxZ + 1;
    layer = window.EditorFrame.clampLayer(layer);
    state.layers.push(layer);
    state.selectedId = layer.id;
    notify();
    return layer;
  }

  function moveLayerZ(id, delta) {
    var sorted = state.layers.slice().sort(function (a, b) {
      return (a.zIndex || 0) - (b.zIndex || 0);
    });
    var idx = sorted.findIndex(function (l) {
      return l.id === id;
    });
    if (idx < 0) return;
    var swapIdx = delta > 0 ? idx + 1 : idx - 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    var a = sorted[idx];
    var b = sorted[swapIdx];
    var tmp = a.zIndex;
    updateLayer(a.id, { zIndex: b.zIndex });
    updateLayer(b.id, { zIndex: tmp });
  }

  function reorderLayers(orderedIds) {
    var n = orderedIds.length;
    orderedIds.forEach(function (id, i) {
      var layer = state.layers.find(function (l) {
        return l.id === id;
      });
      if (layer) layer.zIndex = n - i;
    });
    notify();
  }

  function setFramePreset(preset) {
    state.framePreset = preset;
    if (preset !== "custom") {
      var presetKey = preset === "original" ? "original" : preset;
      var size = window.EditorFrame.frameSizeForPreset(
        presetKey,
        state.videoSource.width,
        state.videoSource.height
      );
      state.frame.width = size.width;
      state.frame.height = size.height;
      window.EditorFrame.setDimensions(size.width, size.height);
    }
    notify();
  }

  function setFrameDimensions(width, height) {
    state.framePreset = "custom";
    state.frame.width = Math.max(1, Math.round(width));
    state.frame.height = Math.max(1, Math.round(height));
    window.EditorFrame.setDimensions(state.frame.width, state.frame.height);
    notify();
  }

  function updateMetaDisplay() {
    var meta = $("editorVideoMeta");
    if (!meta || meta.hidden) return;
    meta.textContent =
      state.video.name +
      " — frame " +
      state.frame.width +
      "×" +
      state.frame.height +
      " (src " +
      state.videoSource.width +
      "×" +
      state.videoSource.height +
      ") — " +
      window.EditorTimeline.formatTime(state.video.duration);
  }

  function isLayerVisibleOnFrame(layer) {
    return window.EditorCaptions.isLayerTimedVisible(layer, state.currentTime);
  }

  function isMainVideoPlaying() {
    return !!(videoEl && !videoEl.paused && !videoEl.ended);
  }

  function revokeLayerResources(layer) {
    if (!layer) return;
    if ((layer.kind === "image" || layer.kind === "video") && layer.src) {
      try {
        URL.revokeObjectURL(layer.src);
      } catch (err) {
        /* ignore */
      }
    }
  }

  function getDuration() {
    return state.video.duration || 0;
  }

  function getCurrentTime() {
    return state.currentTime;
  }

  function setCurrentTime(t, opts) {
    state.currentTime = t;
    if (videoEl && (!opts || !opts.silent)) videoEl.currentTime = t;
    window.EditorLayers.updateVisibilityForTime(t);
  }

  function onTimeUpdate(t) {
    state.currentTime = t;
    window.EditorLayers.updateVisibilityForTime(t);
  }

  function onFrameResize() {
    window.EditorFrame.fitFrameToPreview();
    var layer = getSelectedLayer();
    if (layer) window.EditorTransform.syncTransformBox(layer);
    window.EditorFrame.applyVideoTransform(state.videoTransform);
  }

  function isDrawToolActive() {
    return window.EditorDraw && window.EditorDraw.isToolActive();
  }

  function updateDrawToolButtons() {
    var tool = window.EditorDraw ? window.EditorDraw.getTool() : null;
    var brushBtn = $("editorBrushTool");
    var selectBtn = $("editorSelectTool");
    if (brushBtn) {
      brushBtn.classList.toggle("btn--primary", tool === "brush");
      brushBtn.classList.toggle("btn--secondary", tool !== "brush");
    }
    if (selectBtn) {
      selectBtn.classList.toggle("btn--primary", !tool);
    }
  }

  function showToast(msg) {
    var toast = $("editorToast");
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    setTimeout(function () {
      toast.hidden = true;
    }, 3000);
  }

  function exportJSON() {
    var payload = {
      frame: Object.assign({}, state.frame),
      framePreset: state.framePreset,
      videoSource: Object.assign({}, state.videoSource),
      videoTransform: Object.assign({}, state.videoTransform),
      video: {
        name: state.video.name,
        duration: state.video.duration,
      },
      layers: state.layers.map(function (l) {
        return Object.assign({}, l);
      }),
    };
    return JSON.stringify(payload, null, 2);
  }

  function renderFrameProperties() {
    return (
      '<div class="editor-properties__section">' +
      '<h4 class="editor-properties__heading">Frame bound</h4>' +
      '<div class="form-field"><label for="propFramePreset">Tỷ lệ</label>' +
      '<select id="propFramePreset">' +
      '<option value="original"' +
      (state.framePreset === "original" ? " selected" : "") +
      ">Gốc video</option>" +
      '<option value="16:9"' +
      (state.framePreset === "16:9" ? " selected" : "") +
      ">16:9</option>" +
      '<option value="9:16"' +
      (state.framePreset === "9:16" ? " selected" : "") +
      ">9:16</option>" +
      '<option value="1:1"' +
      (state.framePreset === "1:1" ? " selected" : "") +
      ">1:1</option>" +
      '<option value="4:3"' +
      (state.framePreset === "4:3" ? " selected" : "") +
      ">4:3</option>" +
      '<option value="custom"' +
      (state.framePreset === "custom" ? " selected" : "") +
      ">Tùy chỉnh</option>" +
      "</select></div>" +
      '<div class="editor-properties__offset-grid">' +
      '<div class="form-field"><label for="propFrameWidth">Rộng (px)</label>' +
      '<input type="number" id="propFrameWidth" min="1" step="1" value="' +
      state.frame.width +
      '" /></div>' +
      '<div class="form-field"><label for="propFrameHeight">Cao (px)</label>' +
      '<input type="number" id="propFrameHeight" min="1" step="1" value="' +
      state.frame.height +
      '" /></div>' +
      "</div>" +
      '<p class="field-hint">Preview giữ đúng tỷ lệ frame. Đổi W×H → preset tự chuyển sang Tùy chỉnh.</p>' +
      "</div>"
    );
  }

  function renderTimingFields(layer) {
    return (
      '<div class="form-field form-field--checkbox">' +
      '<label><input type="checkbox" id="propAlwaysVisible"' +
      (layer.alwaysVisible ? " checked" : "") +
      ' /> Luôn hiển thị (bỏ qua timeline)</label></div>' +
      '<div id="propTimingFields"' +
      (layer.alwaysVisible ? " hidden" : "") +
      ">" +
      '<div class="form-field"><label for="propStart">Bắt đầu (s)</label>' +
      '<input type="number" id="propStart" min="0" step="0.1" value="' +
      (layer.start != null ? layer.start : 0) +
      '" /></div>' +
      '<div class="form-field"><label for="propEnd">Kết thúc (s)</label>' +
      '<input type="number" id="propEnd" min="0.1" step="0.1" value="' +
      (layer.end != null ? layer.end : 5) +
      '" /></div>' +
      "</div>"
    );
  }

  function renderOffsetFields(layer) {
    return (
      '<fieldset class="editor-properties__offset">' +
      '<legend>Vị trí (kéo trên khung hoặc nhập số)</legend>' +
      '<div class="editor-properties__offset-grid">' +
      '<div class="form-field"><label for="propX">X (%)</label>' +
      '<input type="number" id="propX" min="0" max="100" step="0.1" value="' +
      Math.round(layer.x * 1000) / 10 +
      '" /></div>' +
      '<div class="form-field"><label for="propY">Y (%)</label>' +
      '<input type="number" id="propY" min="0" max="100" step="0.1" value="' +
      Math.round(layer.y * 1000) / 10 +
      '" /></div>' +
      '<div class="form-field"><label for="propWidth">Rộng (%)</label>' +
      '<input type="number" id="propWidth" min="2" max="100" step="0.1" value="' +
      Math.round(layer.width * 1000) / 10 +
      '" /></div>' +
      '<div class="form-field"><label for="propHeight">Cao (%)</label>' +
      '<input type="number" id="propHeight" min="2" max="100" step="0.1" value="' +
      Math.round(layer.height * 1000) / 10 +
      '" /></div>' +
      "</div></fieldset>"
    );
  }

  function renderProperties() {
    var panel = $("editorProperties");
    if (!panel) return;

    if (!state.selectedId) {
      panel.innerHTML =
        renderFrameProperties() +
        '<p class="editor-panel__empty">Chọn một layer hoặc Video gốc để chỉnh sửa.</p>';
      bindFramePropertyInputs();
      return;
    }

    if (state.selectedId === "__video__") {
      var vt = state.videoTransform;
      panel.innerHTML =
        renderFrameProperties() +
        '<div class="editor-properties__section">' +
        '<h4 class="editor-properties__heading">Video gốc</h4>' +
        renderOffsetFields(vt) +
        '<div class="form-field"><label for="propOpacity">Opacity</label>' +
        '<input type="number" id="propOpacity" min="0" max="1" step="0.05" value="' +
        (vt.opacity != null ? vt.opacity : 1) +
        '" /></div>' +
        '<div class="form-field"><label for="propRotation">Rotation (°)</label>' +
        '<input type="number" id="propRotation" step="1" value="' +
        Math.round(vt.rotation || 0) +
        '" /></div>' +
        '<p class="field-hint">Video có thể kéo ra ngoài frame (overflow). Phần ngoài bị cắt — FFmpeg export dùng <code>crop</code> theo <code>frame</code> + <code>videoTransform</code>.</p></div>';
      bindFramePropertyInputs();
      bindPropertyInputs("__video__");
      return;
    }

    var layer = getSelectedLayer();
    if (!layer) {
      panel.innerHTML =
        renderFrameProperties() +
        '<p class="editor-panel__empty">Chọn một layer để chỉnh sửa.</p>';
      bindFramePropertyInputs();
      return;
    }

    var html =
      '<div class="form-field"><label>Loại</label><input type="text" value="' +
      layer.kind +
      '" disabled /></div>';

    if (layer.kind === "text") {
      var placeholder = window.EditorLayers.TEXT_PLACEHOLDER;
      html +=
        '<div class="form-field"><label for="propText">Nội dung</label>' +
        '<input type="text" id="propText" placeholder="' + escapeAttr(placeholder) + '" value="' +
        (window.EditorLayers.isPlaceholderText(layer.text) ? "" : escapeAttr(layer.text || "")) + '" /></div>' +
        '<div class="form-field"><label for="propFontSize">Font size</label>' +
        '<input type="number" id="propFontSize" min="8" max="120" value="' + (layer.fontSize || 28) + '" /></div>' +
        '<div class="form-field"><label for="propColor">Màu chữ</label>' +
        '<input type="color" id="propColor" value="' + (layer.color || "#ffffff") + '" /></div>' +
        '<div class="form-field"><label for="propBgColor">Màu nền</label>' +
        '<input type="text" id="propBgColor" placeholder="rgba(0,0,0,0.5) hoặc để trống" value="' +
        escapeAttr(layer.bgColor || "") + '" /></div>' +
        renderTimingFields(layer) +
        renderOffsetFields(layer);
    }

    if (layer.kind === "image") {
      html += renderTimingFields(layer) + renderOffsetFields(layer);
    }

    if (layer.kind === "video") {
      html +=
        '<div class="form-field form-field--checkbox">' +
        '<label><input type="checkbox" id="propVideoMuted"' +
        (layer.muted !== false ? " checked" : "") +
        ' /> Tắt tiếng overlay</label></div>' +
        '<div class="form-field form-field--checkbox">' +
        '<label><input type="checkbox" id="propVideoLoop"' +
        (layer.loop ? " checked" : "") +
        ' /> Lặp video</label></div>' +
        renderTimingFields(layer) +
        renderOffsetFields(layer);
    }

    if (layer.kind === "shape") {
      html +=
        '<div class="form-field"><label for="propShape">Hình</label>' +
        '<input type="text" id="propShape" value="' +
        escapeAttr(layer.shape || "rect") +
        '" disabled /></div>' +
        '<div class="form-field"><label for="propStroke">Màu viền</label>' +
        '<input type="color" id="propStroke" value="' +
        (layer.stroke || "#ffffff") +
        '" /></div>' +
        '<div class="form-field form-field--checkbox">' +
        '<label><input type="checkbox" id="propFillOn"' +
        (layer.fill && layer.fill !== "transparent" ? " checked" : "") +
        ' /> Tô nền</label></div>' +
        '<div class="form-field"><label for="propFill">Màu nền</label>' +
        '<input type="color" id="propFill" value="' +
        (layer.fill && layer.fill !== "transparent" ? layer.fill : "#6366f1") +
        '"' +
        (layer.fill && layer.fill !== "transparent" ? "" : " disabled") +
        ' /></div>' +
        '<div class="form-field"><label for="propStrokeWidth">Độ dày nét</label>' +
        '<input type="number" id="propStrokeWidth" min="1" max="40" value="' +
        (layer.strokeWidth || 4) +
        '" /></div>' +
        renderTimingFields(layer) +
        renderOffsetFields(layer);
    }

    if (layer.kind === "draw") {
      html +=
        '<p class="field-hint">Vẽ vector — ' +
        (layer.paths ? layer.paths.length : 0) +
        " nét</p>" +
        renderTimingFields(layer) +
        renderOffsetFields(layer);
    }

    html +=
      '<div class="form-field"><label for="propOpacity">Opacity</label>' +
      '<input type="number" id="propOpacity" min="0" max="1" step="0.05" value="' + (layer.opacity != null ? layer.opacity : 1) + '" /></div>' +
      '<div class="form-field"><label for="propRotation">Rotation (°)</label>' +
      '<input type="number" id="propRotation" step="1" value="' + Math.round(layer.rotation || 0) + '" /></div>';

    panel.innerHTML = html;
    bindPropertyInputs(layer.id);
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function bindFramePropertyInputs() {
    var preset = $("propFramePreset");
    var frameWidth = $("propFrameWidth");
    var frameHeight = $("propFrameHeight");

    if (preset) {
      preset.addEventListener("change", function () {
        setFramePreset(preset.value);
      });
    }
    function applyCustomDimensions() {
      var w = parseInt(frameWidth && frameWidth.value, 10);
      var h = parseInt(frameHeight && frameHeight.value, 10);
      if (isFinite(w) && isFinite(h)) setFrameDimensions(w, h);
    }
    if (frameWidth) {
      frameWidth.addEventListener("change", applyCustomDimensions);
      frameWidth.addEventListener("input", function () {
        if (preset) preset.value = "custom";
      });
    }
    if (frameHeight) {
      frameHeight.addEventListener("change", applyCustomDimensions);
      frameHeight.addEventListener("input", function () {
        if (preset) preset.value = "custom";
      });
    }
  }

  function bindPropertyInputs(layerId) {
    var text = $("propText");
    var fontSize = $("propFontSize");
    var color = $("propColor");
    var bgColor = $("propBgColor");
    var alwaysVisible = $("propAlwaysVisible");
    var timingFields = $("propTimingFields");
    var start = $("propStart");
    var end = $("propEnd");
    var videoMuted = $("propVideoMuted");
    var videoLoop = $("propVideoLoop");
    var propX = $("propX");
    var propY = $("propY");
    var propWidth = $("propWidth");
    var propHeight = $("propHeight");
    var opacity = $("propOpacity");
    var rotation = $("propRotation");
    var propStroke = $("propStroke");
    var propFill = $("propFill");
    var propFillOn = $("propFillOn");
    var propStrokeWidth = $("propStrokeWidth");

    if (text) {
      text.addEventListener("input", function () {
        var val = text.value;
        updateLayer(
          layerId,
          {
            text: val === "" ? window.EditorLayers.TEXT_PLACEHOLDER : val,
          },
          { live: true }
        );
      });
      text.addEventListener("focus", function () {
        var layer = getSelectedLayer();
        if (layer && window.EditorLayers.isPlaceholderText(layer.text)) {
          text.value = "";
        }
      });
    }
    if (fontSize) {
      fontSize.addEventListener("input", function () {
        var v = parseInt(fontSize.value, 10);
        if (isFinite(v)) updateLayer(layerId, { fontSize: v }, { live: true });
      });
    }
    if (color) {
      color.addEventListener("input", function () {
        updateLayer(layerId, { color: color.value }, { live: true });
      });
    }
    if (bgColor) {
      bgColor.addEventListener("change", function () {
        updateLayer(layerId, { bgColor: bgColor.value.trim() || null });
      });
    }
    if (alwaysVisible) {
      alwaysVisible.addEventListener("change", function () {
        updateLayer(layerId, { alwaysVisible: alwaysVisible.checked });
        if (timingFields) timingFields.hidden = alwaysVisible.checked;
        window.EditorCaptions.renderCaptionTracks();
        window.EditorLayers.updateVisibilityForTime(state.currentTime);
      });
    }
    if (start) {
      start.addEventListener("change", function () {
        var v = parseFloat(start.value);
        var layer = getSelectedLayer();
        if (isFinite(v) && layer) {
          var endVal = Math.max(v + 0.1, layer.end || v + 0.1);
          updateLayer(layerId, { start: v, end: endVal });
          window.EditorLayers.updateVisibilityForTime(state.currentTime);
        }
      });
    }
    if (end) {
      end.addEventListener("change", function () {
        var v = parseFloat(end.value);
        var layer = getSelectedLayer();
        if (isFinite(v) && layer && v > (layer.start || 0)) {
          updateLayer(layerId, { end: v });
          window.EditorLayers.updateVisibilityForTime(state.currentTime);
        }
      });
    }
    if (videoMuted) {
      videoMuted.addEventListener("change", function () {
        updateLayer(layerId, { muted: videoMuted.checked });
      });
    }
    if (videoLoop) {
      videoLoop.addEventListener("change", function () {
        updateLayer(layerId, { loop: videoLoop.checked });
      });
    }
    function bindOffsetInput(el, key, scale) {
      if (!el) return;
      el.addEventListener("change", function () {
        var v = parseFloat(el.value);
        if (!isFinite(v)) return;
        var changes = {};
        changes[key] = scale ? v / 100 : v;
        updateLayer(layerId, changes);
        renderProperties();
      });
    }
    bindOffsetInput(propX, "x", true);
    bindOffsetInput(propY, "y", true);
    bindOffsetInput(propWidth, "width", true);
    bindOffsetInput(propHeight, "height", true);
    if (propStroke) {
      propStroke.addEventListener("input", function () {
        updateLayer(layerId, { stroke: propStroke.value }, { live: true });
      });
    }
    if (propFill) {
      propFill.addEventListener("input", function () {
        updateLayer(layerId, { fill: propFill.value }, { live: true });
      });
    }
    if (propFillOn) {
      propFillOn.addEventListener("change", function () {
        if (propFillOn.checked && propFill) {
          propFill.disabled = false;
          updateLayer(layerId, { fill: propFill.value }, { live: true });
        } else {
          if (propFill) propFill.disabled = true;
          updateLayer(layerId, { fill: "transparent" }, { live: true });
        }
      });
    }
    if (propStrokeWidth) {
      propStrokeWidth.addEventListener("input", function () {
        var v = parseInt(propStrokeWidth.value, 10);
        if (isFinite(v)) updateLayer(layerId, { strokeWidth: v }, { live: true });
      });
    }
    if (opacity) {
      opacity.addEventListener("input", function () {
        var v = parseFloat(opacity.value);
        if (isFinite(v)) updateLayer(layerId, { opacity: v }, { live: true });
      });
    }
    if (rotation) {
      rotation.addEventListener("change", function () {
        var v = parseFloat(rotation.value);
        if (isFinite(v)) updateLayer(layerId, { rotation: v });
      });
    }
  }

  function loadVideo(file) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    videoEl.src = videoUrl;
    state.video.name = file.name;

    videoEl.onloadedmetadata = function () {
      var vw = videoEl.videoWidth || 1920;
      var vh = videoEl.videoHeight || 1080;
      state.video.duration = videoEl.duration;
      state.video.name = file.name;
      state.videoSource = {
        width: vw,
        height: vh,
        name: file.name,
        duration: videoEl.duration,
      };
      state.framePreset = "original";
      state.frame.width = vw;
      state.frame.height = vh;
      state.videoTransform = {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        opacity: 1,
      };
      window.EditorFrame.setDimensions(state.frame.width, state.frame.height);
      window.EditorFrame.applyVideoTransform(state.videoTransform);

      var meta = $("editorVideoMeta");
      if (meta) {
        meta.hidden = false;
        updateMetaDisplay();
      }

      $("editorUploadGate").hidden = true;
      $("editorWorkspace").hidden = false;
      window.EditorTimeline.updateTimeDisplay();
      window.EditorTimeline.updatePlayhead();
      onFrameResize();
      notify();
    };
  }

  function resetToUpload() {
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.load();
    }
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      videoUrl = null;
    }
    state.video = { name: "", duration: 0 };
    state.videoSource = { width: 1920, height: 1080, name: "", duration: 0 };
    state.videoTransform = { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1 };
    state.framePreset = "original";
    state.frame = { width: 1920, height: 1080 };
    state.layers.forEach(revokeLayerResources);
    state.layers = [];
    state.selectedId = null;
    state.currentTime = 0;
    $("editorUploadGate").hidden = false;
    $("editorWorkspace").hidden = true;
    var meta = $("editorVideoMeta");
    if (meta) meta.hidden = true;
    var input = $("editorVideoInput");
    if (input) input.value = "";
    notify();
  }

  function bindDropZone(el, handlers) {
    if (!el) return;
    var dragCounter = 0;

    el.addEventListener("dragenter", function (e) {
      e.preventDefault();
      dragCounter += 1;
      el.classList.add("editor-drop-zone--active");
    });
    el.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    el.addEventListener("dragleave", function (e) {
      e.preventDefault();
      dragCounter -= 1;
      if (dragCounter <= 0) {
        dragCounter = 0;
        el.classList.remove("editor-drop-zone--active");
      }
    });
    el.addEventListener("drop", function (e) {
      e.preventDefault();
      dragCounter = 0;
      el.classList.remove("editor-drop-zone--active");
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (handlers.onVideo && file.type.indexOf("video/") === 0) {
          handlers.onVideo(file);
          return;
        }
        if (handlers.onImage && file.type.indexOf("image/") === 0) {
          handlers.onImage(file);
          return;
        }
      }
      showToast("Chỉ hỗ trợ file video hoặc ảnh");
    });
  }

  function bindDragDrop() {
    bindDropZone($("editorUploadGate"), {
      onVideo: function (file) {
        loadVideo(file);
      },
    });

    bindDropZone($("editorFrame"), {
      onVideo: function (file) {
        addVideoLayerFromFile(file);
      },
      onImage: function (file) {
        var url = URL.createObjectURL(file);
        var t = videoEl ? videoEl.currentTime : state.currentTime;
        addLayer(window.EditorLayers.defaultImageLayer(url, t, state.video.duration));
      },
    });
  }

  function bindUpload() {
    var input = $("editorVideoInput");
    if (!input) return;
    input.addEventListener("change", function () {
      if (!input.files || !input.files[0]) return;
      loadVideo(input.files[0]);
    });
  }

  function bindToolbar() {
    $("editorAddText").addEventListener("click", function () {
      var t = videoEl ? videoEl.currentTime : state.currentTime;
      addLayer(window.EditorLayers.defaultTextLayer(t, state.video.duration));
    });

    $("editorAddImage").addEventListener("click", function () {
      $("editorImageInput").click();
    });

    $("editorAddVideo").addEventListener("click", function () {
      $("editorVideoLayerInput").click();
    });

    $("editorImageInput").addEventListener("change", function () {
      var input = $("editorImageInput");
      if (!input.files || !input.files[0]) return;
      var url = URL.createObjectURL(input.files[0]);
      var t = videoEl ? videoEl.currentTime : state.currentTime;
      addLayer(window.EditorLayers.defaultImageLayer(url, t, state.video.duration));
      input.value = "";
    });

    $("editorVideoLayerInput").addEventListener("change", function () {
      var input = $("editorVideoLayerInput");
      if (!input.files || !input.files[0]) return;
      addVideoLayerFromFile(input.files[0]);
      input.value = "";
    });

    var playPauseBtn = $("editorPlayPause");
    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", function () {
        window.EditorTimeline.togglePlayPause();
      });
    }

    var changeVideoBtn = $("editorChangeVideo");
    if (changeVideoBtn) {
      changeVideoBtn.addEventListener("click", function () {
        resetToUpload();
      });
    }

    $("editorExport").addEventListener("click", function () {
      var dialog = $("editorExportDialog");
      var textarea = $("editorExportText");
      textarea.value = exportJSON();
      dialog.showModal();
      showToast("Mock only — chưa xử lý video thật");
    });

    $("editorExportCopy").addEventListener("click", function () {
      var textarea = $("editorExportText");
      textarea.select();
      document.execCommand("copy");
      showToast("Đã copy JSON");
    });

    $("editorExportClose").addEventListener("click", function () {
      $("editorExportDialog").close();
    });

    var shapesToggle = $("editorShapesToggle");
    var shapesMenu = $("editorShapesMenu");
    if (shapesToggle && shapesMenu) {
      shapesToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        shapesMenu.hidden = !shapesMenu.hidden;
      });
      shapesMenu.querySelectorAll("[data-shape]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var shape = btn.getAttribute("data-shape");
          window.EditorDraw.setTool("shape-" + shape);
          shapesMenu.hidden = true;
          updateDrawToolButtons();
        });
      });
      document.addEventListener("click", function () {
        shapesMenu.hidden = true;
      });
    }

    var brushBtn = $("editorBrushTool");
    if (brushBtn) {
      brushBtn.addEventListener("click", function () {
        window.EditorDraw.setTool("brush");
        updateDrawToolButtons();
      });
    }

    var selectBtn = $("editorSelectTool");
    if (selectBtn) {
      selectBtn.addEventListener("click", function () {
        window.EditorDraw.setTool(null);
        updateDrawToolButtons();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && window.EditorDraw) {
        window.EditorDraw.setTool(null);
        updateDrawToolButtons();
      }
    });

    var drawStroke = $("editorDrawStroke");
    var drawFill = $("editorDrawFill");
    var drawFillOn = $("editorDrawFillOn");
    if (drawStroke) {
      drawStroke.addEventListener("input", function () {
        window.EditorDraw.setDrawStroke(drawStroke.value);
      });
    }
    if (drawFill) {
      drawFill.addEventListener("input", function () {
        window.EditorDraw.setShapeFill(
          drawFill.value,
          drawFillOn ? drawFillOn.checked : true
        );
      });
    }
    if (drawFillOn) {
      drawFillOn.addEventListener("change", function () {
        if (drawFill) {
          window.EditorDraw.setShapeFill(
            drawFill.value,
            drawFillOn.checked
          );
        }
        if (drawFill) drawFill.disabled = !drawFillOn.checked;
      });
      if (drawFill) drawFill.disabled = !drawFillOn.checked;
    }
  }

  function initModules() {
    window.EditorFrame.init($("editorFrame"), {
      videoLayerEl: $("editorVideoLayer"),
    });

    window.EditorDraw.init({
      frameEl: $("editorFrame"),
      previewSvg: $("editorDrawPreview"),
      getState: getState,
      addLayer: addLayer,
      getCurrentTime: getCurrentTime,
      getDuration: getDuration,
      onToolChange: updateDrawToolButtons,
    });

    window.EditorTransform.init({
      frameEl: $("editorFrame"),
      transformBox: $("editorTransformBox"),
      getSelectedLayer: getSelectedLayer,
      updateLayer: updateLayer,
      onSelect: selectLayer,
      onDeselect: deselectAll,
      isDrawToolActive: isDrawToolActive,
    });

    var videoLayerEl = $("editorVideoLayer");
    if (videoLayerEl) {
      videoLayerEl.addEventListener("pointerdown", function (e) {
        if (isDrawToolActive()) {
          if (window.EditorDraw && window.EditorDraw.onFramePointerDown) {
            window.EditorDraw.onFramePointerDown(e);
          }
          return;
        }
        window.EditorTransform.onLayerPointerDown(e, "__video__");
      });
    }

    window.EditorLayers.init({
      overlayEl: $("editorOverlay"),
      listEl: $("editorLayersList"),
      emptyEl: $("editorLayersEmpty"),
      getState: getState,
      selectLayer: selectLayer,
      updateLayer: updateLayer,
      deleteLayer: deleteLayer,
      moveLayerZ: moveLayerZ,
      reorderLayers: reorderLayers,
      isLayerVisibleOnFrame: isLayerVisibleOnFrame,
      getCurrentTime: getCurrentTime,
      isMainVideoPlaying: isMainVideoPlaying,
    });

    window.EditorCaptions.init({
      tracksEl: $("editorCaptionTracks"),
      getState: getState,
      getDuration: getDuration,
      updateLayer: updateLayer,
      selectLayer: selectLayer,
    });

    videoEl = $("editorVideo");
    if (videoEl) {
      videoEl.addEventListener("play", function () {
        window.EditorLayers.updateVisibilityForTime(state.currentTime);
      });
      videoEl.addEventListener("pause", function () {
        window.EditorLayers.updateVisibilityForTime(state.currentTime);
      });
    }
    window.EditorTimeline.init({
      timelineEl: $("editorTimeline"),
      playheadEl: $("editorPlayhead"),
      timeDisplayEl: $("editorTimeDisplay"),
      playPauseBtn: $("editorPlayPause"),
      videoEl: videoEl,
      getDuration: getDuration,
      getCurrentTime: getCurrentTime,
      setCurrentTime: setCurrentTime,
      onTimeUpdate: onTimeUpdate,
    });
  }

  function init() {
    initModules();
    bindUpload();
    bindDragDrop();
    bindToolbar();
    window.addEventListener("beforeunload", function () {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    });
  }

  window.EditorApp = {
    init: init,
    getState: getState,
    onFrameResize: onFrameResize,
    exportJSON: exportJSON,
    refreshUI: refreshUI,
  };
})();
