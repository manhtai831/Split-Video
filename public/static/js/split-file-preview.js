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

  function escapeHtml(str) {
    if (window.JobUI && typeof window.JobUI.escapeHtml === "function") {
      return window.JobUI.escapeHtml(str);
    }
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function revokeAllUrls() {
    objectUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    objectUrls = [];
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

  function createPreviewItem(file, url, duration) {
    var item = document.createElement("article");
    item.className = "file-preview-item";
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;
    item.setAttribute("aria-label", "Xem trước " + file.name);

    var thumb = document.createElement("div");
    thumb.className = "file-preview-item__thumb";

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

    revokeAllUrls();
    list.innerHTML = "";

    if (!files || files.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    var items = Array.from(files);
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < items.length; i++) {
      var file = items[i];
      var url = URL.createObjectURL(file);
      objectUrls.push(url);
      var duration = await probeDuration(url);
      fragment.appendChild(createPreviewItem(file, url, duration));
    }

    list.appendChild(fragment);
  }

  function bindEvents() {
    var fileInput = document.getElementById("file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        renderPreviews(fileInput.files);
      });
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
  }

  window.initSplitFilePreview = function () {
    bindEvents();
  };
})();
