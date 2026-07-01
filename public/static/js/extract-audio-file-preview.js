(function () {
  var objectUrls = [];

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
      var video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      function cleanup() {
        video.removeAttribute("src");
        video.load();
      }

      video.onloadedmetadata = function () {
        var duration = video.duration || 0;
        cleanup();
        resolve(duration);
      };
      video.onerror = function () {
        cleanup();
        resolve(0);
      };
      video.src = url;
    });
  }

  function openOverlay(file, url, duration) {
    var modal = document.getElementById("videoPreviewModal");
    var player = document.getElementById("videoPreviewPlayer");
    var title = document.getElementById("videoPreviewTitle");
    var meta = document.getElementById("videoPreviewMeta");
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
    var merged = existing.concat(Array.from(newFiles));
    setInputFiles(fileInput, merged);
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

  function getDuplicateInfo(files) {
    var byName = {};
    var info = {};

    for (var i = 0; i < files.length; i++) {
      var name = files[i].name;
      if (!byName[name]) byName[name] = [];
      byName[name].push(i);
    }

    Object.keys(byName).forEach(function (name) {
      var indices = byName[name];
      if (indices.length < 2) return;

      indices.forEach(function (idx) {
        var others = indices
          .filter(function (i) {
            return i !== idx;
          })
          .map(function (i) {
            return "#" + (i + 1);
          })
          .join(", ");
        info[idx] = "Tên file trùng với " + others + ". Kiểm tra lại trước khi upload.";
      });
    });

    return info;
  }

  function updatePreviewHeader(count) {
    var label = document.getElementById("filePreviewLabel");
    if (label) {
      label.textContent = count > 0 ? "File đã chọn (" + count + ")" : "File đã chọn";
    }
  }

  function createAddPlaceholder() {
    var item = document.createElement("button");
    item.type = "button";
    item.className = "file-preview-item file-preview-item--add";
    item.setAttribute("role", "listitem");
    item.setAttribute("aria-label", "Thêm file video");

    var icon = document.createElement("span");
    icon.className = "file-preview-item__add-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "+";

    var text = document.createElement("span");
    text.className = "file-preview-item__add-label";
    text.textContent = "Thêm file";

    item.appendChild(icon);
    item.appendChild(text);

    item.addEventListener("click", function () {
      var addInput = document.getElementById("fileAddMore");
      if (addInput) addInput.click();
    });

    return item;
  }

  function createPreviewItem(file, url, duration, index, duplicateTooltip) {
    var displayIndex = index + 1;
    var item = document.createElement("article");
    item.className = "file-preview-item";
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;
    item.setAttribute("aria-label", "File #" + displayIndex + ": " + file.name);
    if (duplicateTooltip) {
      item.classList.add("file-preview-item--duplicate");
    }

    var thumb = document.createElement("div");
    thumb.className = "file-preview-item__thumb";

    if (duplicateTooltip) {
      var tooltip = document.createElement("span");
      tooltip.className = "file-preview-item__dup-tooltip";
      tooltip.setAttribute("role", "tooltip");
      tooltip.textContent = duplicateTooltip;
      thumb.appendChild(tooltip);
    }

    var indexBadge = document.createElement("span");
    indexBadge.className = "file-preview-item__index";
    indexBadge.textContent = "#" + displayIndex;
    indexBadge.setAttribute("aria-hidden", "true");

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
      if (video.duration > 0.1) {
        video.currentTime = 0.1;
      }
    };

    var playIcon = document.createElement("span");
    playIcon.className = "file-preview-item__play";
    playIcon.setAttribute("aria-hidden", "true");
    playIcon.textContent = "▶";

    thumb.appendChild(video);
    thumb.appendChild(playIcon);
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

    if (!files || files.length === 0) {
      section.style.display = "none";
      updatePreviewHeader(0);
      if (typeof window.onExtractAudioFilesChanged === "function") {
        window.onExtractAudioFilesChanged([]);
      }
      return;
    }

    section.style.display = "flex";
    updatePreviewHeader(files.length);

    var items = Array.from(files);
    var duplicateInfo = getDuplicateInfo(items);
    var fragment = document.createDocumentFragment();
    var durations = [];

    fragment.appendChild(createAddPlaceholder());

    for (var i = 0; i < items.length; i++) {
      var file = items[i];
      var url = URL.createObjectURL(file);
      objectUrls.push(url);
      var duration = await probeDuration(url);
      durations.push(duration);
      fragment.appendChild(createPreviewItem(file, url, duration, i, duplicateInfo[i]));
    }

    list.appendChild(fragment);

    if (typeof window.onExtractAudioFilesChanged === "function") {
      window.onExtractAudioFilesChanged(durations);
    }
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

    var modal = document.getElementById("videoPreviewModal");
    var closeBtn = document.getElementById("videoPreviewClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeOverlay);
    }
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeOverlay();
      });
      modal.addEventListener("close", function () {
        var player = document.getElementById("videoPreviewPlayer");
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

  window.initExtractAudioFilePreview = function () {
    bindEvents();
    syncFromFileInput();
  };
})();
