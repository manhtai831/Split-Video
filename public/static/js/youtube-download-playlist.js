(function () {
  "use strict";

  var API_BASE = "/api/youtube-download/playlist";
  var PREFS_KEY = "youtubeDownloadPlayer.prefs";

  var state = {
    items: [],
    selectedId: null,
    playingId: null,
    isMediaPlaying: false,
    formats: [],
    selectedFormatId: null,
    formatFilter: "all",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) {
      return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }
    return m + ":" + String(s).padStart(2, "0");
  }

  function readPrefs() {
    if (window.YoutubeDownloadPlayer && window.YoutubeDownloadPlayer.readPrefs) {
      return window.YoutubeDownloadPlayer.readPrefs();
    }
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  function writePrefs(prefs) {
    if (window.YoutubeDownloadPlayer && window.YoutubeDownloadPlayer.writePrefs) {
      window.YoutubeDownloadPlayer.writePrefs(prefs);
      return;
    }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* ignore */
    }
  }

  function savePrefs(partial) {
    var prefs = readPrefs();
    Object.keys(partial).forEach(function (key) {
      prefs[key] = partial[key];
    });
    writePrefs(prefs);
  }

  function setText(el, text, isError) {
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("yt-status--error", !!isError);
  }

  function fetchJSON(url, options) {
    return fetch(url, options).then(function (res) {
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = null;
          }
        }
        if (!res.ok) {
          var msg = (data && data.message) || text || res.statusText || "Request failed";
          if (typeof msg !== "string") msg = "Request failed";
          throw new Error(msg.trim() || "Request failed");
        }
        return data;
      });
    });
  }

  function scoreAudio(f) {
    return (f.abr || 0) * 1000 + (f.filesize || 0) / 1e9;
  }

  function pickBestOfKind(formats, kind) {
    var list = (formats || []).filter(function (f) {
      return f.kind === kind;
    });
    if (!list.length) return null;
    if (kind === "audio") {
      list.sort(function (a, b) {
        return scoreAudio(b) - scoreAudio(a);
      });
      return list[0];
    }
    if (kind === "muxed") {
      list.sort(function (a, b) {
        var ha = parseInt(String(a.resolution || "").split("x")[1], 10) || 0;
        var hb = parseInt(String(b.resolution || "").split("x")[1], 10) || 0;
        if (hb !== ha) return hb - ha;
        return (b.filesize || 0) - (a.filesize || 0);
      });
      return list[0];
    }
    return list[0];
  }

  function pickBestAudio(formats) {
    return pickBestOfKind(formats, "audio") || pickBestOfKind(formats, "muxed");
  }

  function findFormatById(formats, formatId) {
    if (!formatId) return null;
    for (var i = 0; i < formats.length; i++) {
      if (formats[i].format_id === formatId) return formats[i];
    }
    return null;
  }

  function resolveDefaultFormat(formats) {
    var prefs = readPrefs();
    var selected = findFormatById(formats, prefs.preferredFormatId);
    if (selected) return selected;
    if (prefs.preferredKind === "audio" || prefs.preferredKind === "muxed" || prefs.preferredKind === "video") {
      selected = pickBestOfKind(formats, prefs.preferredKind);
      if (selected) return selected;
    }
    return pickBestAudio(formats);
  }

  function applyDefaultFormatSelection() {
    var selected = resolveDefaultFormat(state.formats);
    state.selectedFormatId = selected ? selected.format_id : null;
  }

  function renderFormats() {
    if (!window.YoutubeDownloadFormats) return;
    window.YoutubeDownloadFormats.render(state.formats, state.selectedFormatId, state.formatFilter);
  }

  function renderPlaylist() {
    var list = $("ytPlaylist");
    var empty = $("ytPlaylistEmpty");
    if (!list || !empty) return;

    if (!state.items.length) {
      list.hidden = true;
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = state.items
      .map(function (item) {
        var classes = "yt-playlist__item";
        if (item.id === state.selectedId) classes += " is-active";
        if (item.id === state.playingId) {
          classes += " is-playing";
          if (state.isMediaPlaying) classes += " is-playing--active";
        }
        var thumb = item.thumbnail
          ? '<img class="yt-playlist__thumb" src="' + escapeHtml(item.thumbnail) + '" alt="" loading="lazy" />'
          : '<div class="yt-playlist__thumb yt-playlist__thumb--empty"></div>';
        var playingBadge =
          item.id === state.playingId
            ? '<span class="yt-playlist__eq" aria-hidden="true"><span></span><span></span><span></span></span>'
            : "";
        return (
          '<li class="' +
          classes +
          '" data-id="' +
          item.id +
          '" role="listitem">' +
          '<button type="button" class="yt-playlist__select" data-action="select" data-id="' +
          item.id +
          '">' +
          '<span class="yt-playlist__thumb-wrap">' +
          thumb +
          playingBadge +
          "</span>" +
          '<span class="yt-playlist__body">' +
          '<span class="yt-playlist__title">' +
          escapeHtml(item.title || item.youtube_id) +
          "</span>" +
          '<span class="yt-playlist__meta">' +
          escapeHtml(item.channel || "—") +
          " · " +
          formatDuration(item.duration) +
          "</span>" +
          "</span>" +
          "</button>" +
          '<button type="button" class="btn btn--ghost btn--sm yt-playlist__delete" data-action="delete" data-id="' +
          item.id +
          '" title="Xóa">Xóa</button>' +
          "</li>"
        );
      })
      .join("");
  }

  function onPlayingChange(item, mediaPlaying) {
    var nextId = item ? item.id : null;
    var idChanged = nextId !== state.playingId;
    state.playingId = nextId;
    state.isMediaPlaying = !!mediaPlaying;
    if (idChanged) {
      savePrefs({ playingItemId: nextId || null });
    }
    if (idChanged || !state.items.length) {
      renderPlaylist();
      return;
    }
    var list = $("ytPlaylist");
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll(".yt-playlist__item"), function (li) {
      var id = parseInt(li.getAttribute("data-id"), 10);
      var isPlaying = id === state.playingId;
      li.classList.toggle("is-playing", isPlaying);
      li.classList.toggle("is-playing--active", isPlaying && state.isMediaPlaying);
    });
  }

  function updateFormatPreview(item) {
    if (window.YoutubeDownloadFormats && window.YoutubeDownloadFormats.setPreview) {
      window.YoutubeDownloadFormats.setPreview(item || null);
    }
  }

  function upsertItem(item) {
    if (!item || !item.id) return null;
    var idx = -1;
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === item.id) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      state.items[idx] = Object.assign({}, state.items[idx], item);
    } else {
      state.items.push(item);
    }
    if (window.YoutubeDownloadPlayer) {
      window.YoutubeDownloadPlayer.setPlaylist(state.items);
    }
    return idx >= 0 ? state.items[idx] : item;
  }

  function loadPlaylist() {
    return fetchJSON(API_BASE).then(function (data) {
      state.items = (data && data.items) || [];
      renderPlaylist();
      if (window.YoutubeDownloadPlayer) {
        window.YoutubeDownloadPlayer.setPlaylist(state.items);
      }
      return state.items;
    });
  }

  function selectItem(id, formatsFromAdd, options) {
    options = options || {};
    state.selectedId = id;
    state.selectedFormatId = null;
    savePrefs({ selectedItemId: id || null });
    renderPlaylist();

    var item = state.items.find(function (it) {
      return it.id === id;
    });
    updateFormatPreview(item || null);

    function afterFormats(nextItem) {
      if (nextItem) {
        item = upsertItem(nextItem);
        updateFormatPreview(item);
        renderPlaylist();
      }
      applyDefaultFormatSelection();
      renderFormats();
      if (options.autoPlay && window.YoutubeDownloadPlayer) {
        window.YoutubeDownloadPlayer.playSelectedFormat();
      }
    }

    // Fresh formats just returned from add — skip extra /formats round-trip.
    if (formatsFromAdd && formatsFromAdd.length) {
      state.formats = formatsFromAdd;
      afterFormats(item || null);
      return Promise.resolve();
    }

    if (window.YoutubeDownloadFormats) {
      window.YoutubeDownloadFormats.setLoading(true);
    }

    // Backend checks ProbedAt vs YOUTUBE_FORMATS_CACHE_MINUTES and re-probes if stale.
    return fetchJSON(API_BASE + "/" + id + "/formats")
      .then(function (data) {
        state.formats = (data && data.formats) || [];
        afterFormats((data && data.item) || null);
      })
      .catch(function (err) {
        if (window.YoutubeDownloadFormats) {
          window.YoutubeDownloadFormats.setError(err.message || "Không tải được formats");
        }
      });
  }

  function addUrl(url) {
    var btn = $("youtubeAddBtn");
    var errEl = $("youtubeAddError");
    var statusEl = $("youtubeAddStatus");
    setText(errEl, "", false);
    setText(statusEl, "Đang lấy metadata…", false);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Đang thêm…";
    }

    return fetchJSON(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url }),
    })
      .then(function (data) {
        var item = data && data.item;
        if (item) {
          upsertItem(item);
          renderPlaylist();
          setText(statusEl, "Đã thêm vào playlist.", false);
          return selectItem(item.id, data.formats || []);
        }
        setText(statusEl, "Đã thêm vào playlist.", false);
        return loadPlaylist();
      })
      .catch(function (err) {
        setText(statusEl, "", false);
        setText(errEl, err.message || "Thêm playlist thất bại", true);
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Thêm vào playlist";
        }
      });
  }

  function deleteItem(id) {
    return fetchJSON(API_BASE + "/" + id, { method: "DELETE" }).then(function () {
      var wasSelected = state.selectedId === id;
      var wasPlaying = state.playingId === id;
      return loadPlaylist().then(function () {
        if (wasPlaying && window.YoutubeDownloadPlayer) {
          window.YoutubeDownloadPlayer.clearPlayingItem();
        }
        if (wasSelected) {
          state.selectedId = null;
          state.formats = [];
          state.selectedFormatId = null;
          savePrefs({ selectedItemId: null });
          updateFormatPreview(null);
          if (window.YoutubeDownloadFormats) {
            window.YoutubeDownloadFormats.reset();
          }
          if (state.items.length) {
            return selectItem(state.items[0].id);
          }
        }
      });
    });
  }

  function findItemById(id) {
    if (!id) return null;
    id = parseInt(id, 10);
    if (!id) return null;
    return (
      state.items.find(function (it) {
        return it.id === id;
      }) || null
    );
  }

  function restoreSessionItems() {
    var prefs = readPrefs();
    var playing = findItemById(prefs.playingItemId);
    var selected = findItemById(prefs.selectedItemId);

    if (playing && window.YoutubeDownloadPlayer) {
      window.YoutubeDownloadPlayer.setPlayingItem(playing);
    } else if (prefs.playingItemId) {
      savePrefs({ playingItemId: null });
    }

    if (selected) {
      return selectItem(selected.id);
    }
    if (playing) {
      return selectItem(playing.id);
    }
    if (state.items.length) {
      return selectItem(state.items[0].id);
    }
    return Promise.resolve();
  }

  function onFormatSelected(formatId) {
    state.selectedFormatId = formatId;
    var format = findFormatById(state.formats, formatId);
    if (format) {
      savePrefs({
        preferredFormatId: format.format_id,
        preferredKind: format.kind,
      });
    }
    if (window.YoutubeDownloadFormats) {
      window.YoutubeDownloadFormats.setSelected(formatId);
    }
  }

  function onFilterChanged(filter) {
    state.formatFilter = filter;
    savePrefs({ formatFilter: filter });
    renderFormats();
  }

  function resolveFormat(formatId) {
    if (!state.selectedId || !formatId) {
      return Promise.reject(new Error("Chưa chọn video hoặc format"));
    }
    return fetchJSON(
      API_BASE + "/" + state.selectedId + "/resolve?format_id=" + encodeURIComponent(formatId)
    );
  }

  function getSelectedFormat() {
    var id = state.selectedFormatId;
    if (!id) return null;
    return findFormatById(state.formats, id);
  }

  function getSelectedItem() {
    return (
      state.items.find(function (it) {
        return it.id === state.selectedId;
      }) || null
    );
  }

  function bindEvents() {
    var form = $("youtubeAddForm");
    var input = $("youtube_url");
    if (input) {
      input.addEventListener("focus", function () {
        requestAnimationFrame(function () {
          input.select();
        });
      });
    }
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var url = input ? String(input.value || "").trim() : "";
        if (!url) return;
        addUrl(url);
      });
    }

    var list = $("ytPlaylist");
    if (list) {
      list.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-action]");
        if (!btn) return;
        var id = parseInt(btn.getAttribute("data-id"), 10);
        if (!id) return;
        if (btn.getAttribute("data-action") === "select") {
          selectItem(id);
        } else if (btn.getAttribute("data-action") === "delete") {
          deleteItem(id).catch(function (err) {
            setText($("youtubeAddError"), err.message || "Xóa thất bại", true);
          });
        }
      });
    }
  }

  function restorePrefs() {
    var prefs = readPrefs();
    if (prefs.formatFilter === "all" || prefs.formatFilter === "muxed" || prefs.formatFilter === "audio" || prefs.formatFilter === "video") {
      state.formatFilter = prefs.formatFilter;
    }
  }

  function initYoutubeDownloadPlaylist() {
    restorePrefs();
    if (window.YoutubeDownloadFormats) {
      window.YoutubeDownloadFormats.init({
        onSelect: onFormatSelected,
        onFilter: onFilterChanged,
        onPlay: function (formatId) {
          if (formatId) onFormatSelected(formatId);
          if (window.YoutubeDownloadPlayer) {
            window.YoutubeDownloadPlayer.playSelectedFormat();
          }
        },
        onDownload: function (formatId) {
          if (formatId) onFormatSelected(formatId);
          if (window.YoutubeDownloadPlayer) {
            window.YoutubeDownloadPlayer.downloadSelectedLink();
          }
        },
        onOpenLink: function (formatId) {
          if (formatId) onFormatSelected(formatId);
          if (window.YoutubeDownloadPlayer) {
            window.YoutubeDownloadPlayer.openSelectedLink();
          }
        },
      });
    }
    if (window.YoutubeDownloadPlayer) {
      window.YoutubeDownloadPlayer.init({
        getSelectedFormat: getSelectedFormat,
        getSelectedItem: getSelectedItem,
        resolveFormat: resolveFormat,
        selectItemById: function (id, options) {
          return selectItem(id, null, options);
        },
        getItems: function () {
          return state.items;
        },
        onPlayingChange: onPlayingChange,
      });
    }
    bindEvents();
    loadPlaylist()
      .then(function () {
        return restoreSessionItems();
      })
      .catch(function (err) {
        setText($("youtubeAddError"), err.message || "Không tải được playlist", true);
      });
  }

  window.initYoutubeDownloadPlaylist = initYoutubeDownloadPlaylist;
  window.YoutubeDownloadPlaylist = {
    getState: function () {
      return state;
    },
    selectItem: selectItem,
    resolveFormat: resolveFormat,
  };
})();
