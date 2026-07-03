(function () {
  "use strict";

  var entries = [];
  var index = -1;
  var getState = null;
  var applyState = null;
  var listEl = null;
  var maxEntries = 50;
  var onEntriesChanged = null;
  var isApplying = false;

  function cloneSnapshot(state) {
    return {
      frame: Object.assign({}, state.frame),
      framePreset: state.framePreset,
      layers: JSON.parse(JSON.stringify(state.layers)),
      selectedId: state.selectedId,
    };
  }

  function collectBlobUrlsFromLayers(layers, out) {
    if (!layers) return;
    layers.forEach(function (layer) {
      if (layer && layer.src) out[layer.src] = true;
    });
  }

  function getRetainedBlobUrls() {
    var urls = {};
    entries.forEach(function (entry) {
      collectBlobUrlsFromLayers(entry.snapshot.layers, urls);
    });
    if (getState) {
      collectBlobUrlsFromLayers(getState().layers, urls);
    }
    return urls;
  }

  function purgeOldest() {
    while (entries.length > maxEntries) {
      entries.shift();
      index -= 1;
    }
    if (index < 0 && entries.length) index = 0;
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!entries.length) return;

    for (var i = entries.length - 1; i >= 0; i--) {
      (function (idx) {
        var entry = entries[idx];
        var li = document.createElement("li");
        li.className = "editor-history-item";
        if (idx === index) {
          li.classList.add("editor-history-item--current");
        }
        li.textContent = entry.label;
        li.title = entry.label;
        li.addEventListener("click", function () {
          jumpTo(idx);
        });
        listEl.appendChild(li);
      })(i);
    }
  }

  function applyEntry(idx) {
    if (!applyState || idx < 0 || idx >= entries.length) return;
    isApplying = true;
    applyState(entries[idx].snapshot);
    index = idx;
    isApplying = false;
    render();
  }

  function record(label) {
    if (isApplying || !getState) return;
    var snapshot = cloneSnapshot(getState());
    entries = entries.slice(0, index + 1);
    entries.push({ label: label || "Thay đổi", snapshot: snapshot });
    index = entries.length - 1;
    purgeOldest();
    render();
    if (onEntriesChanged) onEntriesChanged();
  }

  function undo() {
    if (!canUndo()) return;
    applyEntry(index - 1);
    if (onEntriesChanged) onEntriesChanged();
  }

  function redo() {
    if (!canRedo()) return;
    applyEntry(index + 1);
    if (onEntriesChanged) onEntriesChanged();
  }

  function jumpTo(idx) {
    if (idx < 0 || idx >= entries.length || idx === index) return;
    applyEntry(idx);
    if (onEntriesChanged) onEntriesChanged();
  }

  function canUndo() {
    return index > 0;
  }

  function canRedo() {
    return index >= 0 && index < entries.length - 1;
  }

  function init(opts) {
    getState = opts.getState;
    applyState = opts.applyState;
    listEl = opts.listEl;
    maxEntries = opts.maxEntries || 50;
    onEntriesChanged = opts.onEntriesChanged || null;
    entries = [];
    index = -1;
    render();
  }

  function reset() {
    entries = [];
    index = -1;
    render();
  }

  window.EditorHistory = {
    init: init,
    record: record,
    undo: undo,
    redo: redo,
    jumpTo: jumpTo,
    render: render,
    reset: reset,
    canUndo: canUndo,
    canRedo: canRedo,
    getRetainedBlobUrls: getRetainedBlobUrls,
  };
})();
