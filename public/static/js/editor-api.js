(function () {
  "use strict";

  var API_BASE = "/api/editor/jobs";

  function request(url, options) {
    return fetch(url, options).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (err) {
            data = text;
          }
        }
        if (!res.ok) {
          var msg =
            (data && data.error) ||
            (typeof data === "string" && data) ||
            "Request failed (" + res.status + ")";
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function buildFormData(config, files) {
    var fd = new FormData();
    fd.append("config", JSON.stringify(config));
    (files || []).forEach(function (entry) {
      if (!entry || !entry.clientKey || !entry.file) return;
      fd.append("file_" + entry.clientKey, entry.file, entry.file.name || entry.clientKey);
    });
    return fd;
  }

  function createJob(config, files) {
    return request(API_BASE, {
      method: "POST",
      body: buildFormData(config, files),
    });
  }

  function getJob(identifier) {
    return request(API_BASE + "/" + encodeURIComponent(identifier));
  }

  function updateJob(identifier, config, files) {
    return request(API_BASE + "/" + encodeURIComponent(identifier), {
      method: "PUT",
      body: buildFormData(config, files),
    });
  }

  function duplicateJob(identifier) {
    return request(API_BASE + "/" + encodeURIComponent(identifier) + "/duplicate", {
      method: "POST",
    });
  }

  function publishJob(identifier) {
    return request(API_BASE + "/" + encodeURIComponent(identifier) + "/publish", {
      method: "POST",
    });
  }

  function revertDraft(identifier) {
    return request(API_BASE + "/" + encodeURIComponent(identifier) + "/draft", {
      method: "POST",
    });
  }

  window.EditorAPI = {
    createJob: createJob,
    getJob: getJob,
    updateJob: updateJob,
    duplicateJob: duplicateJob,
    publishJob: publishJob,
    revertDraft: revertDraft,
  };
})();
