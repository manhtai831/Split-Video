(function () {
  "use strict";

  var QUALITY_BYTES_PER_PIXEL = {
    gif: { low: 0.8, medium: 1.2, high: 2.0, max: 2.5, custom: 1.5 },
    webp: { low: 0.3, medium: 0.5, high: 0.8, max: 1.2, custom: 0.6 },
    apng: { low: 1.0, medium: 1.5, high: 2.2, max: 3.0, custom: 1.8 },
  };

  function $(id) {
    return document.getElementById(id);
  }

  function formatFileSize(bytes) {
    if (window.JobUI && typeof window.JobUI.formatFileSize === "function") {
      return window.JobUI.formatFileSize(bytes);
    }
    if (!bytes || bytes < 1) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function getSegments() {
    if (typeof window.getGifSegments === "function") {
      var segs = window.getGifSegments();
      if (segs && segs.length > 0) return segs;
    }
    var startInput = $("startAt");
    var durationInput = $("duration");
    var start = parseFloat(startInput ? startInput.value : "0") || 0;
    var dur = parseFloat(durationInput ? durationInput.value : "5") || 5;
    return [{ start_at: start, duration: dur }];
  }

  function estimateSegmentBytes(fmt, preset, width, height, fps, duration) {
    var table = QUALITY_BYTES_PER_PIXEL[fmt] || QUALITY_BYTES_PER_PIXEL.gif;
    var factor = table[preset] || table.high;
    var frames = Math.max(1, Math.round(fps * duration));
    return Math.round(width * height * frames * factor * 0.01);
  }

  function updateEstimate() {
    var box = $("gifEstimateBox");
    var sizeEl = $("gifEstimateSize");
    if (!box || !sizeEl) return;

    var fmt = $("output_fmt") ? $("output_fmt").value : "gif";
    var preset = $("quality_preset") ? $("quality_preset").value : "high";
    var width = parseInt($("width") ? $("width").value : "0", 10) || 0;
    var height = parseInt($("height") ? $("height").value : "0", 10) || 0;
    var fps = parseInt($("fps") ? $("fps").value : "10", 10) || 10;

    if (!width || !height) {
      box.hidden = true;
      return;
    }

    var segments = getSegments();
    var total = 0;
    segments.forEach(function (seg) {
      total += estimateSegmentBytes(fmt, preset, width, height, fps, seg.duration);
    });

    box.hidden = false;
    sizeEl.textContent = formatFileSize(total);
    if (segments.length > 1) {
      sizeEl.textContent += " (" + segments.length + " đoạn)";
    }
  }

  function bindEvents() {
    [
      "output_fmt",
      "quality_preset",
      "width",
      "height",
      "fps",
      "startAt",
      "duration",
      "max_colors",
      "webp_quality",
    ].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", updateEstimate);
      if (el) el.addEventListener("change", updateEstimate);
    });

    window.onGifDimensionsChanged = updateEstimate;
    window.onGifTimelineChanged = updateEstimate;
    window.onGifSegmentsChanged = updateEstimate;
  }

  function initGifEstimate() {
    bindEvents();
    updateEstimate();
  }

  window.initGifEstimate = initGifEstimate;
})();
