(function () {
  "use strict";

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

  function clearFile() {
    var fileInput = document.getElementById("file");
    if (!fileInput) return;
    setInputFiles(fileInput, []);
  }

  function updatePreviewHeader(hasFile) {
    var label = document.getElementById("filePreviewLabel");
    if (label) {
      label.textContent = hasFile ? "File đã chọn" : "File đã chọn";
    }
  }

  function createPreviewItem(file, url, duration) {
    var item = document.createElement("article");
    item.className = "file-preview-item";
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;
    item.setAttribute("aria-label", file.name);

    var thumb = document.createElement("div");
    thumb.className = "file-preview-item__thumb";

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "file-preview-item__remove";
    removeBtn.setAttribute("aria-label", "Xóa " + file.name);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      clearFile();
    });

    var playIcon = document.createElement("span");
    playIcon.className = "file-preview-item__play";
    playIcon.setAttribute("aria-hidden", "true");
    playIcon.textContent = "♪";

    thumb.appendChild(playIcon);
    thumb.appendChild(removeBtn);

    var body = document.createElement("div");
    body.className = "file-preview-item__body";

    var name = document.createElement("p");
    name.className = "file-preview-item__name";
    name.title = file.name;
    name.textContent = file.name;

    var meta = document.createElement("p");
    meta.className = "file-preview-item__meta";
    meta.textContent = formatDuration(duration) + " · " + formatFileSize(file.size);

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
      updatePreviewHeader(false);
      if (typeof window.onTrimAudioFilesChanged === "function") {
        window.onTrimAudioFilesChanged([]);
      }
      return;
    }

    var file = files[0];
    section.style.display = "flex";
    updatePreviewHeader(true);

    var url = URL.createObjectURL(file);
    objectUrls.push(url);
    var duration = await probeDuration(url);
    list.appendChild(createPreviewItem(file, url, duration));

    if (typeof window.onTrimAudioFilesChanged === "function") {
      window.onTrimAudioFilesChanged([duration]);
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
        // Enforce single file even if browser somehow provides more.
        if (fileInput.files && fileInput.files.length > 1) {
          setInputFiles(fileInput, [fileInput.files[0]]);
          return;
        }
        renderPreviews(fileInput.files);
      });
    }

    var clearAllBtn = document.getElementById("filePreviewClearAll");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", clearFile);
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

  window.clearTrimAudioFile = clearFile;
  window.initTrimAudioFilePreview = function () {
    bindEvents();
    syncFromFileInput();
  };
})();
