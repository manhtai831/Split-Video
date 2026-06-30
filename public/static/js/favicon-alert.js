(function () {
  "use strict";

  var POLL_INTERVAL_MS = 5000;
  var JOBS_LIMIT = 20;
  var FAVICON_NORMAL = "/static/favicon.svg";
  var FAVICON_ALERT = "/static/favicon-alert.svg";
  var ACTIVE_STATUSES = { pending: true, processing: true };
  var TERMINAL_STATUSES = { completed: true, failed: true };

  var isAlert = false;
  var snapshot = {};
  var pollTimer = null;

  function getFaviconLink() {
    return document.getElementById("app-favicon");
  }

  function setFavicon(alert) {
    if (alert === isAlert) return;
    isAlert = alert;
    var link = getFaviconLink();
    if (!link) return;
    link.href = alert ? FAVICON_ALERT : FAVICON_NORMAL;
  }

  function fetchJobs() {
    return fetch("/api/jobs?limit=" + JOBS_LIMIT, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("jobs fetch failed");
      return res.json();
    });
  }

  function applySnapshot(items) {
    var next = {};
    (items || []).forEach(function (job) {
      if (job && job.identifier) {
        next[job.identifier] = job.status;
      }
    });
    snapshot = next;
  }

  function refreshSnapshot() {
    return fetchJobs()
      .then(function (data) {
        applySnapshot(data.items);
      })
      .catch(function () {
        /* silent */
      });
  }

  function checkJobTransitions(items) {
    if (document.visibilityState !== "hidden") return;

    (items || []).forEach(function (job) {
      if (!job || !job.identifier) return;
      var prev = snapshot[job.identifier];
      var next = job.status;
      if (prev && ACTIVE_STATUSES[prev] && TERMINAL_STATUSES[next]) {
        setFavicon(true);
      }
      snapshot[job.identifier] = next;
    });
  }

  function pollJobs() {
    if (document.visibilityState !== "hidden") return;
    fetchJobs()
      .then(function (data) {
        checkJobTransitions(data.items);
      })
      .catch(function () {
        /* silent */
      });
  }

  function startHiddenPoll() {
    stopHiddenPoll();
    pollTimer = setInterval(pollJobs, POLL_INTERVAL_MS);
  }

  function stopHiddenPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function onTabVisible() {
    setFavicon(false);
    stopHiddenPoll();
    refreshSnapshot();
  }

  function onTabHidden() {
    refreshSnapshot().then(function () {
      if (document.visibilityState === "hidden") {
        startHiddenPoll();
      }
    });
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") {
      onTabVisible();
    } else {
      onTabHidden();
    }
  }

  function init() {
    setFavicon(false);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", function () {
      if (document.visibilityState === "visible") {
        onTabVisible();
      }
    });
    refreshSnapshot();
    if (document.visibilityState === "hidden") {
      startHiddenPoll();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
