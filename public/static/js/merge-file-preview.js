(function () {
  "use strict";

  var MAX_MERGE_CLIPS = 200;
  var objectUrls = [];
  var clipMeta = [];
  var dragIndex = null;
  var dropPlaceholder = null;
  var dragOverTargetIndex = null;
  var dragInsertBefore = true;
  var listDragBound = false;
  var imageModalIndex = null;
  var holdDurationByKey = {};

  function fileKey(file) {
    return (file.name || "") + "|" + (file.size || 0) + "|" + (file.lastModified || 0);
  }

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

  function formatSecondsLabel(seconds) {
    if (!seconds || !isFinite(seconds)) return "—";
    if (Math.abs(seconds - Math.round(seconds)) < 0.05) {
      return Math.round(seconds) + ".0s";
    }
    return seconds.toFixed(1) + "s";
  }

  function detectKind(file) {
    if (file.type && file.type.startsWith("video/")) return "video";
    if (file.type === "image/gif") return "gif";
    if (file.type && file.type.startsWith("image/")) return "image";
    var name = (file.name || "").toLowerCase();
    if (/\.(jpe?g|png|webp)$/.test(name)) return "image";
    if (/\.gif$/.test(name)) return "gif";
    if (/\.(mp4|mov|mkv|webm|avi|m4v|flv|ts|m2ts|3gp)$/.test(name)) return "video";
    return "video";
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

  function probeImageMeta(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        resolve({
          duration: 0,
          width: img.naturalWidth || 0,
          height: img.naturalHeight || 0,
        });
      };
      img.onerror = function () {
        resolve({ duration: 0, width: 0, height: 0 });
      };
      img.src = url;
    });
  }

  function defaultHoldDuration(kind) {
    if (kind === "gif") return 0;
    if (kind === "image") return 2;
    return 0;
  }

  function effectiveDuration(meta) {
    if (!meta) return 0;
    if (meta.kind === "video") return meta.duration || 0;
    if (meta.kind === "image") return meta.holdDuration > 0 ? meta.holdDuration : 2;
    if (meta.kind === "gif") {
      if (meta.holdDuration > 0) return meta.holdDuration;
      if (meta.nativeDuration > 0) return meta.nativeDuration;
      return 2;
    }
    return meta.duration || 0;
  }

  function durationBadgeText(meta) {
    if (!meta || meta.kind === "video") return formatDuration(meta ? meta.duration : 0);
    if (meta.kind === "image") return formatSecondsLabel(meta.holdDuration > 0 ? meta.holdDuration : 2);
    if (meta.kind === "gif") {
      if (meta.holdDuration > 0) return formatSecondsLabel(meta.holdDuration);
      if (meta.nativeDuration > 0) return "≈" + formatSecondsLabel(meta.nativeDuration);
      return "gốc";
    }
    return "—";
  }

  function hasImageClips() {
    for (var i = 0; i < clipMeta.length; i++) {
      if (clipMeta[i].kind === "image" || clipMeta[i].kind === "gif") return true;
    }
    return false;
  }

  function notifyItemsChanged(files) {
    syncItemsMeta();
    updateTimelineSummary(files, clipMeta);
    updateCompatBanner(files, clipMeta);
    if (window.MergeEstimate && typeof window.MergeEstimate.onFilesChanged === "function") {
      window.MergeEstimate.onFilesChanged(files, clipMeta);
    }
  }

  function revokeAllUrls() {
    objectUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    objectUrls = [];
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
    if (total > MAX_MERGE_CLIPS) {
      var allowed = MAX_MERGE_CLIPS - existing.length;
      if (allowed <= 0) {
        alert("Tối đa " + MAX_MERGE_CLIPS + " clip/ảnh mỗi lần ghép.");
        return;
      }
      incoming = incoming.slice(0, allowed);
      alert("Chỉ thêm được " + allowed + " file nữa (tối đa " + MAX_MERGE_CLIPS + " clip/ảnh).");
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
      totalDuration += effectiveDuration(metas[i]);
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

    if (hasImageClips()) {
      banner.style.display = "flex";
      textEl.textContent =
        "Có ảnh/GIF — ảnh sẽ được chuyển thành video clip trước khi ghép. Không dùng được ghép nhanh (copy stream).";
      return;
    }

    var sizeSelect = document.getElementById("size");
    var isKeep = sizeSelect && sizeSelect.value === "keep";

    var ref = metas[0];
    var resolutionMismatch = false;
    for (var i = 1; i < metas.length; i++) {
      if (metas[i].width !== ref.width || metas[i].height !== ref.height) {
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
      textEl.textContent = "Clip khác resolution — sẽ re-encode về " + target + ".";
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

  function syncItemsMeta() {
    var field = document.getElementById("itemsMeta");
    var fileInput = document.getElementById("file");
    if (!field || !fileInput || !fileInput.files) return;

    var items = [];
    for (var i = 0; i < fileInput.files.length; i++) {
      var meta = clipMeta[i] || { kind: "video", holdDuration: 0 };
      items.push({
        index: i,
        kind: meta.kind || "video",
        hold_duration: meta.kind === "video" ? undefined : meta.holdDuration,
      });
    }
    field.value = JSON.stringify(items);
  }

  window.syncMergeFileOrder = syncFileOrderField;
  window.syncMergeItemsMeta = syncItemsMeta;
  window.getMergeClipMeta = function () {
    return clipMeta;
  };

  function openOverlay(file, url, meta) {
    var modal = document.getElementById("videoPreviewModal");
    var player = document.getElementById("videoPreviewPlayer");
    var viewer = document.getElementById("imagePreviewViewer");
    var title = document.getElementById("videoPreviewTitle");
    var metaEl = document.getElementById("videoPreviewMeta");
    if (!modal || !player) return;

    closeImageDurationModal();
    if (viewer) {
      viewer.style.display = "none";
      viewer.innerHTML = "";
    }
    player.style.display = "block";

    if (title) title.textContent = file.name;
    if (metaEl) {
      var res = meta.width && meta.height ? meta.width + "×" + meta.height + " · " : "";
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

  function openImageOverlay(file, url, meta) {
    var modal = document.getElementById("videoPreviewModal");
    var player = document.getElementById("videoPreviewPlayer");
    var viewer = document.getElementById("imagePreviewViewer");
    var title = document.getElementById("videoPreviewTitle");
    var metaEl = document.getElementById("videoPreviewMeta");
    if (!modal || !viewer) return;

    closeImageDurationModal();
    player.pause();
    player.removeAttribute("src");
    player.load();
    player.style.display = "none";

    if (title) title.textContent = file.name;
    if (metaEl) {
      var res = meta.width && meta.height ? meta.width + "×" + meta.height + " · " : "";
      metaEl.textContent =
        res + durationBadgeText(meta) + " · " + formatFileSize(file.size);
    }

    viewer.innerHTML = "";
    viewer.style.display = "block";
    if (meta.kind === "gif") {
      var vid = document.createElement("video");
      vid.className = "video-preview-modal__player";
      vid.src = url;
      vid.controls = true;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.autoplay = true;
      viewer.appendChild(vid);
    } else {
      var img = document.createElement("img");
      img.className = "video-preview-modal__image";
      img.src = url;
      img.alt = file.name;
      viewer.appendChild(img);
    }

    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
  }

  function closeOverlay() {
    var modal = document.getElementById("videoPreviewModal");
    var player = document.getElementById("videoPreviewPlayer");
    var viewer = document.getElementById("imagePreviewViewer");
    if (!modal) return;
    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
      player.style.display = "block";
    }
    if (viewer) {
      viewer.innerHTML = "";
      viewer.style.display = "none";
    }
    if (typeof modal.close === "function") {
      modal.close();
    } else {
      modal.removeAttribute("open");
    }
  }

  function closeImageDurationModal() {
    var modal = document.getElementById("imageDurationModal");
    if (!modal) return;
    imageModalIndex = null;
    if (typeof modal.close === "function") {
      modal.close();
    } else {
      modal.removeAttribute("open");
    }
  }

  function updateImageModalHint(meta) {
    var hint = document.getElementById("imageDurationNativeHint");
    if (!hint) return;
    if (meta && meta.kind === "gif" && meta.nativeDuration > 0) {
      hint.textContent = "Thời lượng gốc ≈ " + meta.nativeDuration.toFixed(1) + "s";
      hint.style.display = "block";
    } else {
      hint.style.display = "none";
      hint.textContent = "";
    }
  }

  function openImageDurationModal(index, file, url, meta) {
    var modal = document.getElementById("imageDurationModal");
    var title = document.getElementById("imageDurationTitle");
    var input = document.getElementById("imageDurationInput");
    if (!modal || !input) return;

    closeOverlay();
    imageModalIndex = index;
    if (title) title.textContent = file.name;

    if (meta.kind === "gif") {
      input.min = "0";
      input.step = "0.1";
    } else {
      input.min = "0.5";
      input.step = "0.1";
    }

    input.max = "60";
    input.value = String(meta.holdDuration);
    updateImageModalHint(meta);

    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
  }

  function saveImageDuration() {
    if (imageModalIndex === null) return;
    var input = document.getElementById("imageDurationInput");
    var meta = clipMeta[imageModalIndex];
    if (!input || !meta) return;

    var value = parseFloat(input.value);
    if (!isFinite(value)) {
      alert("Vui lòng nhập số giây hợp lệ.");
      return;
    }
    if (meta.kind === "image" && value < 0.5) {
      alert("Ảnh tĩnh: thời lượng tối thiểu 0.5 giây.");
      return;
    }
    if (meta.kind === "gif" && value < 0) {
      alert("GIF: thời lượng không được âm. Nhập 0 để dùng thời lượng gốc.");
      return;
    }
    if (value > 60) value = 60;

    meta.holdDuration = value;
    var fileInput = document.getElementById("file");
    if (fileInput && fileInput.files && fileInput.files[imageModalIndex]) {
      holdDurationByKey[fileKey(fileInput.files[imageModalIndex])] = value;
    }
    closeImageDurationModal();
    if (fileInput && fileInput.files) {
      renderPreviews(fileInput.files);
    }
  }

  function applyDurationPreset(seconds) {
    var input = document.getElementById("imageDurationInput");
    if (input) input.value = String(seconds);
  }

  function createAddPlaceholder() {
    var item = document.createElement("button");
    item.type = "button";
    item.className = "file-preview-item file-preview-item--add";
    item.setAttribute("role", "listitem");
    item.setAttribute("aria-label", "Thêm clip hoặc ảnh");

    var icon = document.createElement("span");
    icon.className = "file-preview-item__add-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "+";

    var text = document.createElement("span");
    text.className = "file-preview-item__add-label";
    text.textContent = "Thêm clip/ảnh";

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

  function buildMetaLine(displayIndex, meta, file) {
    var res = meta.width && meta.height ? meta.width + "×" + meta.height + " · " : "";
    var durPart =
      meta.kind === "video" ? formatDuration(meta.duration) : durationBadgeText(meta);
    return (
      "#" + displayIndex + " · " + res + durPart + " · " + formatFileSize(file.size)
    );
  }

  function createVideoPreviewItem(file, url, meta, index) {
    var displayIndex = index + 1;
    var item = document.createElement("article");
    item.className = "file-preview-item";
    item.style.cursor = "grab";
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

    var metaLine = document.createElement("p");
    metaLine.className = "file-preview-item__meta";
    metaLine.textContent = buildMetaLine(displayIndex, meta, file);

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

  function createImagePreviewItem(file, url, meta, index) {
    var displayIndex = index + 1;
    var item = document.createElement("article");
    item.className = "file-preview-item file-preview-item--image";
    item.style.cursor = "grab";
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;
    item.setAttribute("aria-label", "Ảnh #" + displayIndex + ": " + file.name);

    var thumb = document.createElement("div");
    thumb.className = "file-preview-item__thumb file-preview-item__thumb--previewable";
    thumb.setAttribute("role", "button");
    thumb.tabIndex = 0;
    thumb.setAttribute("aria-label", "Xem ảnh: " + file.name);

    var dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "file-preview-item__drag";
    dragHandle.setAttribute("aria-label", "Kéo để sắp xếp ảnh #" + displayIndex);
    dragHandle.textContent = "⋮⋮";
    dragHandle.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    var indexBadge = document.createElement("span");
    indexBadge.className = "file-preview-item__index";
    indexBadge.textContent = "#" + displayIndex;

    var kindBadge = document.createElement("span");
    kindBadge.className = "file-preview-item__kind-badge";
    kindBadge.textContent = "Ảnh";

    var durationBadge = document.createElement("span");
    durationBadge.className = "file-preview-item__duration-badge";
    durationBadge.textContent = durationBadgeText(meta);

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

    if (meta.kind === "gif") {
      var gifVid = document.createElement("video");
      gifVid.className = "file-preview-item__video";
      gifVid.muted = true;
      gifVid.playsInline = true;
      gifVid.loop = true;
      gifVid.autoplay = true;
      gifVid.preload = "metadata";
      gifVid.src = url;
      gifVid.setAttribute("aria-hidden", "true");
      thumb.appendChild(gifVid);
    } else {
      var img = document.createElement("img");
      img.className = "file-preview-item__img";
      img.src = url;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      thumb.appendChild(img);
    }

    var playIcon = document.createElement("span");
    playIcon.className = "file-preview-item__play";
    playIcon.setAttribute("aria-hidden", "true");
    playIcon.textContent = "▶";

    thumb.appendChild(playIcon);
    thumb.appendChild(dragHandle);
    thumb.appendChild(indexBadge);
    thumb.appendChild(kindBadge);
    thumb.appendChild(durationBadge);
    thumb.appendChild(removeBtn);

    var body = document.createElement("div");
    body.className = "file-preview-item__body";

    var name = document.createElement("p");
    name.className = "file-preview-item__name file-preview-item__name--editable";
    name.title = "Chỉnh thời lượng: " + file.name;
    name.textContent = file.name;
    name.setAttribute("role", "button");
    name.tabIndex = 0;
    name.setAttribute("aria-label", "Chỉnh thời lượng: " + file.name);

    var metaLine = document.createElement("p");
    metaLine.className = "file-preview-item__meta";
    metaLine.textContent = buildMetaLine(displayIndex, meta, file);

    body.appendChild(name);
    body.appendChild(metaLine);
    item.appendChild(thumb);
    item.appendChild(body);

    bindDragReorder(item, index);

    function openPreview(e) {
      if (e) e.stopPropagation();
      openImageOverlay(file, url, meta);
    }

    function openDurationEditor(e) {
      if (e) e.stopPropagation();
      openImageDurationModal(index, file, url, meta);
    }

    thumb.addEventListener("click", openPreview);
    thumb.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        openPreview();
      }
    });

    name.addEventListener("click", openDurationEditor);
    name.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        openDurationEditor();
      }
    });

    return item;
  }

  async function probeClipMeta(file, url, kind) {
    if (kind === "video") {
      var videoMeta = await probeVideoMeta(url);
      return {
        kind: "video",
        width: videoMeta.width,
        height: videoMeta.height,
        duration: videoMeta.duration,
        holdDuration: 0,
        nativeDuration: 0,
      };
    }

    if (kind === "gif") {
      var gifMeta = await probeVideoMeta(url);
      if (gifMeta.duration > 0 && gifMeta.duration < 0.2) {
        return {
          kind: "image",
          width: gifMeta.width,
          height: gifMeta.height,
          duration: 0,
          holdDuration: 2,
          nativeDuration: gifMeta.duration,
        };
      }
      return {
        kind: "gif",
        width: gifMeta.width,
        height: gifMeta.height,
        duration: gifMeta.duration,
        holdDuration: 0,
        nativeDuration: gifMeta.duration,
      };
    }

    var imageMeta = await probeImageMeta(url);
    return {
      kind: "image",
      width: imageMeta.width,
      height: imageMeta.height,
      duration: 0,
      holdDuration: 2,
      nativeDuration: 0,
    };
  }

  async function renderPreviews(files) {
    var section = document.getElementById("filePreviewSection");
    var list = document.getElementById("filePreviewList");
    if (!section || !list) return;

    closeOverlay();
    closeImageDurationModal();
    revokeAllUrls();
    list.innerHTML = "";
    clipMeta = [];

    if (!files || files.length === 0) {
      section.style.display = "none";
      updatePreviewHeader(0);
      updateTimelineSummary([], []);
      updateCompatBanner([], []);
      holdDurationByKey = {};
      syncItemsMeta();
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
      var kind = detectKind(file);
      var meta = await probeClipMeta(file, url, kind);
      var key = fileKey(file);
      if (holdDurationByKey[key] !== undefined && meta.kind !== "video") {
        meta.holdDuration = holdDurationByKey[key];
      } else if (meta.kind !== "video") {
        holdDurationByKey[key] = meta.holdDuration;
      }
      clipMeta.push(meta);
      if (meta.kind === "video") {
        fragment.appendChild(createVideoPreviewItem(file, url, meta, i));
      } else {
        fragment.appendChild(createImagePreviewItem(file, url, meta, i));
      }
    }

    list.appendChild(fragment);
    bindListDragReorder(list);
    syncFileOrderField();
    notifyItemsChanged(items);
  }

  function bindEvents() {
    var fileInput = document.getElementById("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        if (fileInput.files && fileInput.files.length > MAX_MERGE_CLIPS) {
          alert("Tối đa " + MAX_MERGE_CLIPS + " clip/ảnh mỗi lần ghép.");
          setInputFiles(fileInput, Array.from(fileInput.files).slice(0, MAX_MERGE_CLIPS));
          return;
        }
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

    var imageModal = document.getElementById("imageDurationModal");
    var imageClose = document.getElementById("imageDurationClose");
    var imageCancel = document.getElementById("imageDurationCancel");
    var imageSave = document.getElementById("imageDurationSave");
    if (imageClose) imageClose.addEventListener("click", closeImageDurationModal);
    if (imageCancel) imageCancel.addEventListener("click", closeImageDurationModal);
    if (imageSave) imageSave.addEventListener("click", saveImageDuration);
    if (imageModal) {
      imageModal.addEventListener("click", function (e) {
        if (e.target === imageModal) closeImageDurationModal();
      });
    }

    document.querySelectorAll("[data-duration-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var val = parseFloat(btn.getAttribute("data-duration-preset"));
        if (isFinite(val)) applyDurationPreset(val);
      });
    });

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
