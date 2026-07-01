(function () {
  "use strict";

  var objectUrls = [];
  var clipMeta = [];
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

  function revokeAllUrls() {
    objectUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    objectUrls = [];
  }

  function probeVideoMeta(url) {
    return new Promise(function (resolve) {
      var video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      function cleanup() {
        video.removeAttribute("src");
        video.load();
      }

      video.onloadedmetadata = function () {
        var meta = {
          duration: video.duration || 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        };
        cleanup();
        resolve(meta);
      };
      video.onerror = function () {
        cleanup();
        resolve({ duration: 0, width: 0, height: 0 });
      };
      video.src = url;
    });
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
    setInputFiles(fileInput, existing.concat(Array.from(newFiles)));
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

  function updatePreviewHeader(count) {
    var label = document.getElementById("filePreviewLabel");
    if (label) {
      label.textContent = count > 0 ? "Clip đã chọn (" + count + ")" : "Clip đã chọn";
    }
  }

  function updateTimelineSummary(files, metas) {
    var box = document.getElementById("timelineSummary");
    var text = document.getElementById("timelineSummaryText");
    if (!box || !text) return;

    if (!files || files.length === 0) {
      box.style.display = "none";
      return;
    }

    var totalDuration = 0;
    var totalSize = 0;
    for (var i = 0; i < files.length; i++) {
      totalSize += files[i].size || 0;
      if (metas[i]) {
        totalDuration += metas[i].duration || 0;
      }
    }

    text.textContent =
      files.length +
      " clip · " +
      formatDuration(totalDuration) +
      " tổng · ~" +
      formatFileSize(totalSize);
    box.style.display = "block";
  }

  function updateCompatBanner(files, metas) {
    var banner = document.getElementById("compatBanner");
    var textEl = document.getElementById("compatBannerText");
    if (!banner || !textEl) return;

    if (!files || files.length < 2) {
      banner.style.display = "none";
      return;
    }

    var sizeSelect = document.getElementById("size");
    var isKeep = sizeSelect && sizeSelect.value === "keep";

    var ref = metas[0];
    var resolutionMismatch = false;
    for (var i = 1; i < metas.length; i++) {
      if (
        metas[i].width !== ref.width ||
        metas[i].height !== ref.height
      ) {
        resolutionMismatch = true;
        break;
      }
    }

    banner.style.display = "flex";

    if (isKeep && !resolutionMismatch) {
      textEl.textContent =
        "Tất cả clip tương thích — có thể ghép nhanh (copy stream) khi chọn Original Size.";
    } else if (resolutionMismatch) {
      var target = sizeSelect ? sizeSelect.options[sizeSelect.selectedIndex].text : "đích";
      textEl.textContent =
        "Clip khác resolution — sẽ re-encode về " + target + ".";
    } else {
      textEl.textContent =
        "Đã chọn re-encode — clip sẽ được chuẩn hóa về độ phân giải đích.";
    }
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

  window.syncMergeFileOrder = syncFileOrderField;

  function openOverlay(file, url, meta) {
    var modal = document.getElementById("videoPreviewModal");
    var player = document.getElementById("videoPreviewPlayer");
    var title = document.getElementById("videoPreviewTitle");
    var metaEl = document.getElementById("videoPreviewMeta");
    if (!modal || !player) return;

    if (title) title.textContent = file.name;
    if (metaEl) {
      var res =
        meta.width && meta.height ? meta.width + "×" + meta.height + " · " : "";
      metaEl.textContent =
        res + formatDuration(meta.duration) + " · " + formatFileSize(file.size);
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
    var modal = document.getElementById("videoPreviewModal");
    var player = document.getElementById("videoPreviewPlayer");
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

  function createAddPlaceholder() {
    var item = document.createElement("button");
    item.type = "button";
    item.className = "file-preview-item file-preview-item--add";
    item.setAttribute("role", "listitem");
    item.setAttribute("aria-label", "Thêm clip video");

    var icon = document.createElement("span");
    icon.className = "file-preview-item__add-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "+";

    var text = document.createElement("span");
    text.className = "file-preview-item__add-label";
    text.textContent = "Thêm clip";

    item.appendChild(icon);
    item.appendChild(text);
    item.addEventListener("click", function () {
      var addInput = document.getElementById("fileAddMore");
      if (addInput) addInput.click();
    });
    return item;
  }

  function createDropPlaceholder() {
    var item = document.createElement("article");
    item.className = "file-preview-item file-preview-item--drop-placeholder";
    item.setAttribute("aria-hidden", "true");

    var thumb = document.createElement("div");
    thumb.className = "file-preview-item__thumb file-preview-drop-placeholder__thumb";

    var icon = document.createElement("span");
    icon.className = "file-preview-drop-placeholder__icon";
    icon.setAttribute("aria-hidden", "true");
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
    if (fromIndex < to) {
      to -= 1;
    }
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

  function createPreviewItem(file, url, meta, index) {
    var displayIndex = index + 1;
    var item = document.createElement("article");
    item.className = "file-preview-item";
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;
    item.setAttribute("aria-label", "Clip #" + displayIndex + ": " + file.name);

    var thumb = document.createElement("div");
    thumb.className = "file-preview-item__thumb";

    var dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "file-preview-item__drag";
    dragHandle.setAttribute("aria-label", "Kéo để sắp xếp clip #" + displayIndex);
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

    var video = document.createElement("video");
    video.className = "file-preview-item__video";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    video.setAttribute("aria-hidden", "true");
    video.onloadedmetadata = function () {
      if (video.duration > 0.1) video.currentTime = 0.1;
    };

    var playIcon = document.createElement("span");
    playIcon.className = "file-preview-item__play";
    playIcon.setAttribute("aria-hidden", "true");
    playIcon.textContent = "▶";

    thumb.appendChild(video);
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

    var res =
      meta.width && meta.height ? meta.width + "×" + meta.height + " · " : "";
    var metaLine = document.createElement("p");
    metaLine.className = "file-preview-item__meta";
    metaLine.textContent =
      "#" +
      displayIndex +
      " · " +
      res +
      formatDuration(meta.duration) +
      " · " +
      formatFileSize(file.size);

    body.appendChild(name);
    body.appendChild(metaLine);
    item.appendChild(thumb);
    item.appendChild(body);

    bindDragReorder(item, index);

    function activate() {
      openOverlay(file, url, meta);
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
    clipMeta = [];

    if (!files || files.length === 0) {
      section.style.display = "none";
      updatePreviewHeader(0);
      updateTimelineSummary([], []);
      updateCompatBanner([], []);
      if (window.MergeEstimate && typeof window.MergeEstimate.onFilesChanged === "function") {
        window.MergeEstimate.onFilesChanged([], []);
      }
      return;
    }

    section.style.display = "flex";
    updatePreviewHeader(files.length);

    var items = Array.from(files);
    var fragment = document.createDocumentFragment();
    fragment.appendChild(createAddPlaceholder());

    for (var i = 0; i < items.length; i++) {
      var file = items[i];
      var url = URL.createObjectURL(file);
      objectUrls.push(url);
      var meta = await probeVideoMeta(url);
      clipMeta.push(meta);
      fragment.appendChild(createPreviewItem(file, url, meta, i));
    }

    list.appendChild(fragment);
    bindListDragReorder(list);
    syncFileOrderField();
    updateTimelineSummary(items, clipMeta);
    updateCompatBanner(items, clipMeta);

    if (window.MergeEstimate && typeof window.MergeEstimate.onFilesChanged === "function") {
      window.MergeEstimate.onFilesChanged(items, clipMeta);
    }
  }

  function bindEvents() {
    var fileInput = document.getElementById("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        renderPreviews(fileInput.files);
      });
    }

    var addMoreInput = document.getElementById("fileAddMore");
    if (addMoreInput) {
      addMoreInput.addEventListener("change", function () {
        if (addMoreInput.files && addMoreInput.files.length > 0) {
          addFiles(addMoreInput.files);
        }
        addMoreInput.value = "";
      });
    }

    var clearAllBtn = document.getElementById("filePreviewClearAll");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", clearAllFiles);
    }

    var sizeSelect = document.getElementById("size");
    if (sizeSelect) {
      sizeSelect.addEventListener("change", function () {
        var fileInput = document.getElementById("file");
        if (fileInput && fileInput.files) {
          updateCompatBanner(Array.from(fileInput.files), clipMeta);
        }
        if (window.MergeEstimate && typeof window.MergeEstimate.updateEstimate === "function") {
          window.MergeEstimate.updateEstimate();
        }
      });
    }

    var modal = document.getElementById("videoPreviewModal");
    var closeBtn = document.getElementById("videoPreviewClose");
    if (closeBtn) closeBtn.addEventListener("click", closeOverlay);
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeOverlay();
      });
    }

    window.addEventListener("beforeunload", revokeAllUrls);
  }

  window.initMergeFilePreview = function () {
    bindEvents();
    var fileInput = document.getElementById("file");
    if (fileInput) {
      renderPreviews(fileInput.files);
    }
  };
})();
