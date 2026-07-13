(function () {
  "use strict";

  var MAX_MERGE_AUDIO_CLIPS = 200;
  var objectUrls = [];
  var fileDurations = [];
  var dragIndex = null;
  var dropPlaceholder = null;
  var dragOverTargetIndex = null;
  var dragInsertBefore = true;
  var listDragBound = false;

  function formatFileSize(bytes) {
    if (window.JobUI && typeof window.JobUI.formatFileSize === "function") {
      return window.JobUI.formatFileSize(bytes);
    }
    if (!bytes || bytes < 1) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  }

  function formatDuration(seconds) {
    if (!seconds || !isFinite(seconds)) return "—";
    var total = Math.round(seconds);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    if (h > 0) {
      return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }
    return m + ":" + String(s).padStart(2, "0");
  }

  function probeDuration(url) {
    return new Promise(function (resolve) {
      var audio = document.createElement("audio");
      audio.preload = "metadata";

      function cleanup() {
        audio.removeAttribute("src");
        audio.load();
      }

      audio.onloadedmetadata = function () {
        var duration = audio.duration || 0;
        cleanup();
        resolve(duration);
      };
      audio.onerror = function () {
        cleanup();
        resolve(0);
      };
      audio.src = url;
    });
  }

  function openOverlay(file, url, duration) {
    var modal = document.getElementById("audioPreviewModal");
    var player = document.getElementById("audioPreviewPlayer");
    var title = document.getElementById("audioPreviewTitle");
    var meta = document.getElementById("audioPreviewMeta");
    if (!modal || !player) return;

    if (title) title.textContent = file.name;
    if (meta) {
      meta.textContent = formatDuration(duration) + " · " + formatFileSize(file.size);
    }

    player.src = url;
    player.currentTime = 0;
    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
    player.play().catch(function () {});
  }

  function closeOverlay() {
    var modal = document.getElementById("audioPreviewModal");
    var player = document.getElementById("audioPreviewPlayer");
    if (!modal) return;

    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    if (typeof modal.close === "function") {
      modal.close();
    } else {
      modal.removeAttribute("open");
    }
  }

  function setInputFiles(input, files) {
    var dt = new DataTransfer();
    for (var i = 0; i < files.length; i++) {
      dt.items.add(files[i]);
    }
    input.files = dt.files;
    if (files.length === 0) {
      input.value = "";
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function addFiles(newFiles) {
    var fileInput = document.getElementById("file");
    if (!fileInput || !newFiles || newFiles.length === 0) return;
    var existing = Array.from(fileInput.files || []);
    var incoming = Array.from(newFiles);
    var total = existing.length + incoming.length;
    if (total > MAX_MERGE_AUDIO_CLIPS) {
      var allowed = MAX_MERGE_AUDIO_CLIPS - existing.length;
      if (allowed <= 0) {
        alert("Tối đa " + MAX_MERGE_AUDIO_CLIPS + " file audio mỗi lần ghép.");
        return;
      }
      incoming = incoming.slice(0, allowed);
      alert("Chỉ thêm được " + allowed + " file nữa (tối đa " + MAX_MERGE_AUDIO_CLIPS + ").");
    }
    setInputFiles(fileInput, existing.concat(incoming));
  }

  function clearAllFiles() {
    var fileInput = document.getElementById("file");
    if (!fileInput) return;
    setInputFiles(fileInput, []);
  }

  function removeFileAt(index) {
    var fileInput = document.getElementById("file");
    if (!fileInput || !fileInput.files) return;
    var files = Array.from(fileInput.files);
    if (index < 0 || index >= files.length) return;
    files.splice(index, 1);
    setInputFiles(fileInput, files);
  }

  function moveFile(fromIndex, toIndex) {
    var fileInput = document.getElementById("file");
    if (!fileInput || !fileInput.files) return;
    var files = Array.from(fileInput.files);
    if (fromIndex < 0 || fromIndex >= files.length || toIndex < 0 || toIndex >= files.length) {
      return;
    }
    var item = files.splice(fromIndex, 1)[0];
    files.splice(toIndex, 0, item);
    setInputFiles(fileInput, files);
  }

  function syncFileOrderField() {
    var orderInput = document.getElementById("fileOrder");
    var fileInput = document.getElementById("file");
    if (!orderInput || !fileInput || !fileInput.files) return;
    var indices = [];
    for (var i = 0; i < fileInput.files.length; i++) {
      indices.push(String(i));
    }
    orderInput.value = indices.join(",");
  }

  window.syncMergeAudioFileOrder = syncFileOrderField;

  function updatePreviewHeader(count) {
    var label = document.getElementById("filePreviewLabel");
    if (label) {
      label.textContent = count > 0 ? "File đã chọn (" + count + ")" : "File đã chọn";
    }
  }

  function notifyFilesChanged(files) {
    syncFileOrderField();
    if (typeof window.onMergeAudioFilesChanged === "function") {
      window.onMergeAudioFilesChanged(files, fileDurations.slice());
    }
  }

  function createDropPlaceholder() {
    var item = document.createElement("article");
    item.className = "file-preview-item file-preview-drop-placeholder";
    item.setAttribute("aria-hidden", "true");

    var thumb = document.createElement("div");
    thumb.className = "file-preview-item__thumb";
    var icon = document.createElement("span");
    icon.className = "file-preview-drop-placeholder__icon";
    icon.textContent = "⇅";
    thumb.appendChild(icon);

    var body = document.createElement("div");
    body.className = "file-preview-item__body";
    var label = document.createElement("p");
    label.className = "file-preview-drop-placeholder__label";
    label.textContent = "Thả vào đây";
    body.appendChild(label);

    item.appendChild(thumb);
    item.appendChild(body);
    return item;
  }

  function removeDropPlaceholder() {
    if (dropPlaceholder && dropPlaceholder.parentNode) {
      dropPlaceholder.parentNode.removeChild(dropPlaceholder);
    }
    dragOverTargetIndex = null;
  }

  function resolveDropIndex(fromIndex, targetIndex, insertBefore) {
    var to = insertBefore ? targetIndex : targetIndex + 1;
    if (fromIndex < to) to -= 1;
    return to;
  }

  function findDropTarget(list, clientX) {
    var items = list.querySelectorAll(
      ".file-preview-item[data-index]:not(.file-preview-item--dragging)"
    );
    if (!items.length) return null;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var index = parseInt(item.dataset.index, 10);
      var rect = item.getBoundingClientRect();
      var mid = rect.left + rect.width / 2;
      if (clientX < mid) {
        return { item: item, index: index, insertBefore: true };
      }
      if (clientX <= rect.right) {
        return { item: item, index: index, insertBefore: false };
      }
    }

    var last = items[items.length - 1];
    return {
      item: last,
      index: parseInt(last.dataset.index, 10),
      insertBefore: false,
    };
  }

  function updateDropPlaceholder(list, clientX) {
    if (dragIndex === null) return;
    var target = findDropTarget(list, clientX);
    if (!target) {
      removeDropPlaceholder();
      return;
    }
    var toIndex = resolveDropIndex(dragIndex, target.index, target.insertBefore);
    if (toIndex === dragIndex) {
      removeDropPlaceholder();
      return;
    }
    if (!dropPlaceholder) {
      dropPlaceholder = createDropPlaceholder();
    }
    dragOverTargetIndex = target.index;
    dragInsertBefore = target.insertBefore;
    var refNode = target.insertBefore ? target.item : target.item.nextSibling;
    if (dropPlaceholder.parentNode !== list || dropPlaceholder.nextSibling !== refNode) {
      list.insertBefore(dropPlaceholder, refNode);
    }
  }

  function bindListDragReorder(list) {
    if (listDragBound) return;
    listDragBound = true;

    list.addEventListener("dragover", function (e) {
      if (dragIndex === null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      updateDropPlaceholder(list, e.clientX);
    });

    list.addEventListener("drop", function (e) {
      e.preventDefault();
      if (dragIndex === null) return;
      if (dragOverTargetIndex !== null) {
        var to = resolveDropIndex(dragIndex, dragOverTargetIndex, dragInsertBefore);
        if (dragIndex !== to) {
          moveFile(dragIndex, to);
        }
      }
      removeDropPlaceholder();
    });

    list.addEventListener("dragleave", function (e) {
      if (!list.contains(e.relatedTarget)) {
        removeDropPlaceholder();
      }
    });
  }

  function bindDragReorder(item, index) {
    item.draggable = true;
    item.dataset.index = String(index);

    item.addEventListener("dragstart", function (e) {
      dragIndex = index;
      item.classList.add("file-preview-item--dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      }
    });

    item.addEventListener("dragend", function () {
      dragIndex = null;
      item.classList.remove("file-preview-item--dragging");
      removeDropPlaceholder();
    });
  }

  function createPreviewItem(file, url, duration, index) {
    var displayIndex = index + 1;
    var item = document.createElement("article");
    item.className = "file-preview-item";
    item.style.cursor = "grab";
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;
    item.setAttribute("aria-label", "File #" + displayIndex + ": " + file.name);

    var thumb = document.createElement("div");
    thumb.className = "file-preview-item__thumb";

    var dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "file-preview-item__drag";
    dragHandle.setAttribute("aria-label", "Kéo để sắp xếp file #" + displayIndex);
    dragHandle.textContent = "⋮⋮";
    dragHandle.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    var indexBadge = document.createElement("span");
    indexBadge.className = "file-preview-item__index";
    indexBadge.textContent = "#" + displayIndex;

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "file-preview-item__remove";
    removeBtn.setAttribute("aria-label", "Xóa " + file.name);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      removeFileAt(index);
    });

    var playIcon = document.createElement("span");
    playIcon.className = "file-preview-item__play";
    playIcon.setAttribute("aria-hidden", "true");
    playIcon.textContent = "♪";

    thumb.appendChild(playIcon);
    thumb.appendChild(dragHandle);
    thumb.appendChild(indexBadge);
    thumb.appendChild(removeBtn);

    var body = document.createElement("div");
    body.className = "file-preview-item__body";

    var name = document.createElement("p");
    name.className = "file-preview-item__name";
    name.title = file.name;
    name.textContent = file.name;

    var meta = document.createElement("p");
    meta.className = "file-preview-item__meta";
    meta.textContent =
      "#" + displayIndex + " · " + formatDuration(duration) + " · " + formatFileSize(file.size);

    body.appendChild(name);
    body.appendChild(meta);
    item.appendChild(thumb);
    item.appendChild(body);

    bindDragReorder(item, index);

    function activate() {
      openOverlay(file, url, duration);
    }
    item.addEventListener("click", activate);
    item.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });

    return item;
  }

  async function renderPreviews(files) {
    var section = document.getElementById("filePreviewSection");
    var list = document.getElementById("filePreviewList");
    if (!section || !list) return;

    closeOverlay();
    revokeAllUrls();
    list.innerHTML = "";
    fileDurations = [];

    if (!files || files.length === 0) {
      section.style.display = "none";
      updatePreviewHeader(0);
      notifyFilesChanged([]);
      return;
    }

    section.style.display = "flex";
    updatePreviewHeader(files.length);
    bindListDragReorder(list);

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var url = URL.createObjectURL(file);
      objectUrls.push(url);
      var duration = await probeDuration(url);
      fileDurations.push(duration);
      list.appendChild(createPreviewItem(file, url, duration, i));
    }

    notifyFilesChanged(files);
  }

  function revokeAllUrls() {
    objectUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    objectUrls = [];
  }

  function syncFromFileInput() {
    var fileInput = document.getElementById("file");
    if (!fileInput) return;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function bindEvents() {
    var fileInput = document.getElementById("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        if (fileInput.files && fileInput.files.length > MAX_MERGE_AUDIO_CLIPS) {
          setInputFiles(fileInput, Array.from(fileInput.files).slice(0, MAX_MERGE_AUDIO_CLIPS));
          alert("Tối đa " + MAX_MERGE_AUDIO_CLIPS + " file audio mỗi lần ghép.");
          return;
        }
        renderPreviews(fileInput.files);
      });
    }

    var addMoreInput = document.getElementById("fileAddMore");
    var addMoreBtn = document.getElementById("filePreviewAddMore");
    if (addMoreBtn && addMoreInput) {
      addMoreBtn.addEventListener("click", function () {
        addMoreInput.click();
      });
      addMoreInput.addEventListener("change", function () {
        if (addMoreInput.files && addMoreInput.files.length) {
          addFiles(addMoreInput.files);
          addMoreInput.value = "";
        }
      });
    }

    var clearAllBtn = document.getElementById("filePreviewClearAll");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", clearAllFiles);
    }

    var modal = document.getElementById("audioPreviewModal");
    var closeBtn = document.getElementById("audioPreviewClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeOverlay);
    }
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeOverlay();
      });
      modal.addEventListener("close", function () {
        var player = document.getElementById("audioPreviewPlayer");
        if (player) {
          player.pause();
          player.removeAttribute("src");
          player.load();
        }
      });
    }

    window.addEventListener("beforeunload", revokeAllUrls);
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) {
        syncFromFileInput();
      }
    });
  }

  window.clearMergeAudioFiles = clearAllFiles;
  window.initMergeAudioFilePreview = function () {
    bindEvents();
    syncFromFileInput();
  };
})();
