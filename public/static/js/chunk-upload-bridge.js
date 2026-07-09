import { uploadFiles } from "./chunk-upload.js";

function ensureProgressEl(form) {
  var el = form.querySelector(".chunk-upload-progress");
  if (!el) {
    el = document.createElement("div");
    el.className = "chunk-upload-progress";
    el.hidden = true;
    el.innerHTML =
      '<div class="chunk-upload-progress__label">Đang tải lên...</div>' +
      '<div class="chunk-upload-progress__bar"><div class="chunk-upload-progress__fill"></div></div>' +
      '<span class="chunk-upload-progress__pct">0%</span>';
    form.insertBefore(el, form.firstChild);
  }
  return el;
}

function updateProgress(el, percent) {
  el.hidden = false;
  var fill = el.querySelector(".chunk-upload-progress__fill");
  var pct = el.querySelector(".chunk-upload-progress__pct");
  if (fill) fill.style.width = percent + "%";
  if (pct) pct.textContent = percent + "%";
}

function setPreuploadedFiles(form, files) {
  var input = form.querySelector('input[name="preuploaded_files"]');
  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = "preuploaded_files";
    form.appendChild(input);
  }
  input.value = JSON.stringify(
    files.map(function (f) {
      return { path: f.path, name: f.name };
    })
  );
}

async function submitFormWithChunks(form, fileInput, options) {
  options = options || {};
  var files = options.files;
  if (!files) {
    files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
  }
  if (!files.length) {
    throw new Error("Chưa chọn file");
  }

  var progressEl = ensureProgressEl(form);
  var submitBtn = form.querySelector('button[type="submit"]');
  var originalBtnText = submitBtn ? submitBtn.innerText : "";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "Đang tải lên...";
  }

  try {
    var completed = await uploadFiles(files, {
      onProgress: function (state) {
        updateProgress(progressEl, state.percent);
      },
    });
    setPreuploadedFiles(form, completed);
    if (fileInput) {
      fileInput.removeAttribute("name");
      fileInput.required = false;
    }
    form.submit();
  } catch (err) {
    progressEl.hidden = true;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
    throw err;
  }
}

window.ChunkUpload = {
  submitFormWithChunks: submitFormWithChunks,
  uploadFiles: uploadFiles,
};
