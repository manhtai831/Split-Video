import Queue from "./dependencies/queue.js";

const CONCURRENCY = 8;

function getChunkSize() {
  if (window.__UPLOAD_CHUNK_SIZE && window.__UPLOAD_CHUNK_SIZE > 0) {
    return window.__UPLOAD_CHUNK_SIZE;
  }
  return 5 * 1024 * 1024;
}

function totalPartsForFile(file, chunkSize) {
  return Math.max(1, Math.ceil(file.size / chunkSize));
}

async function prepareUpload(files, chunkSize) {
  const meta = files.map(function (f) {
    return {
      name: f.name,
      size: f.size,
      total_parts: totalPartsForFile(f, chunkSize),
    };
  });
  const res = await fetch("/api/upload/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_count: files.length, files: meta }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

async function uploadPart(file, folder, partIndex, chunkSize) {
  const start = (partIndex - 1) * chunkSize;
  const end = Math.min(file.size, start + chunkSize);
  const blob = file.slice(start, end);
  const fd = new FormData();
  fd.append("folder", folder);
  fd.append("part_index", String(partIndex));
  fd.append("file", blob, file.name);
  const res = await fetch("/api/upload/part", { method: "POST", body: fd });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

async function completeUpload(items) {
  const res = await fetch("/api/upload/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: items }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = await res.json();
  return data.files;
}

export async function uploadFiles(files, options) {
  options = options || {};
  const fileList = Array.from(files);
  if (!fileList.length) {
    throw new Error("No files to upload");
  }

  const chunkSize = getChunkSize();
  const prepareData = await prepareUpload(fileList, chunkSize);
  const slots = prepareData.slots || [];

  const filePlans = fileList.map(function (file, i) {
    return {
      file: file,
      folder: slots[i].folder,
      totalParts: totalPartsForFile(file, chunkSize),
      fileIndex: i,
    };
  });

  const totalPartsAll = filePlans.reduce(function (sum, plan) {
    return sum + plan.totalParts;
  }, 0);
  let uploadedParts = 0;

  const queue = new Queue({ concurrency: CONCURRENCY, autostart: false });

  queue.addEventListener("error", function (evt) {
    queue.end(evt.detail.error);
  });

  for (const plan of filePlans) {
    for (let part = 1; part <= plan.totalParts; part++) {
      queue.push(function (next) {
        uploadPart(plan.file, plan.folder, part, chunkSize)
          .then(function () {
            uploadedParts++;
            if (typeof options.onProgress === "function") {
              options.onProgress({
                uploadedParts: uploadedParts,
                totalParts: totalPartsAll,
                fileIndex: plan.fileIndex,
                fileName: plan.file.name,
                percent: Math.round((uploadedParts / totalPartsAll) * 100),
              });
            }
            next();
          })
          .catch(next);
      });
    }
  }

  await queue.start();

  const items = filePlans.map(function (plan) {
    return {
      folder: plan.folder,
      file_name: plan.file.name,
      total_parts: plan.totalParts,
    };
  });

  return completeUpload(items);
}
