(function () {
  "use strict";

  var API_BASE = "/api/youtube-download/playlist";
  var CATEGORIES_API = "/api/youtube-download/categories";
  var PREFS_KEY = "youtubeDownloadPlayer.prefs";
  var TAB_ALL = "all";

  var state = {
    items: [],
    categories: [],
    activeTab: TAB_ALL,
    categoryTabsEditMode: false,
    selectedId: null,
    playingId: null,
    isMediaPlaying: false,
    formats: [],
    selectedFormatId: null,
    formatFilter: "all",
  };

  var dragFromIndex = null;
  var dragOverIndex = null;
  var dragInsertBefore = true;
  var listDragBound = false;
  var reorderPending = false;

  var catDragFromId = null;
  var catDragOverId = null;
  var catDragInsertBefore = true;
  var catTabsDragBound = false;
  var catReorderPending = false;
  var assignMenuBound = false;

  var ICON_DRAG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>' +
    '<circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>' +
    "</svg>";

  var ICON_STAR =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
    "</svg>";

  var ICON_TRASH =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>' +
    '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>' +
    "</svg>";

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

  function clearDragIndicators() {
    var list = $("ytPlaylist");
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll(".yt-playlist__item"), function (li) {
      li.classList.remove("is-drag-over-before", "is-drag-over-after", "is-dragging");
    });
    dragOverIndex = null;
  }

  function resolveDropIndex(fromIndex, targetIndex, insertBefore) {
    var to = insertBefore ? targetIndex : targetIndex + 1;
    if (fromIndex < to) to -= 1;
    return to;
  }

  function findDropTarget(list, clientY) {
    var items = list.querySelectorAll(".yt-playlist__item:not(.is-dragging)");
    if (!items.length) return null;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var index = parseInt(item.getAttribute("data-index"), 10);
      var rect = item.getBoundingClientRect();
      var mid = rect.top + rect.height / 2;

      if (clientY < mid) {
        return { item: item, index: index, insertBefore: true };
      }
      if (clientY <= rect.bottom) {
        return { item: item, index: index, insertBefore: false };
      }
    }

    var last = items[items.length - 1];
    return {
      item: last,
      index: parseInt(last.getAttribute("data-index"), 10),
      insertBefore: false,
    };
  }

  function updateDragIndicators(list, clientY) {
    if (dragFromIndex === null) return;
    var target = findDropTarget(list, clientY);
    clearDragIndicators();
    var dragging = list.querySelector('.yt-playlist__item[data-index="' + dragFromIndex + '"]');
    if (dragging) dragging.classList.add("is-dragging");
    if (!target) return;

    var toIndex = resolveDropIndex(dragFromIndex, target.index, target.insertBefore);
    if (toIndex === dragFromIndex) return;

    dragOverIndex = target.index;
    dragInsertBefore = target.insertBefore;
    target.item.classList.add(target.insertBefore ? "is-drag-over-before" : "is-drag-over-after");
  }

  function moveItem(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return Promise.resolve();
    if (fromIndex >= state.items.length || toIndex >= state.items.length) return Promise.resolve();
    if (reorderPending) return Promise.resolve();

    var items = state.items.slice();
    var moved = items.splice(fromIndex, 1)[0];
    items.splice(toIndex, 0, moved);
    items.forEach(function (it, i) {
      it.position = i;
    });
    state.items = items;

    if (window.YoutubeDownloadPlayer) {
      window.YoutubeDownloadPlayer.setPlaylist(state.items);
    }
    renderPlaylist();

    reorderPending = true;
    return fetchJSON(API_BASE + "/" + moved.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: toIndex }),
    })
      .then(function (updated) {
        if (updated && typeof updated.position === "number") {
          for (var i = 0; i < state.items.length; i++) {
            if (state.items[i].id === updated.id) {
              state.items[i] = Object.assign({}, state.items[i], updated);
              break;
            }
          }
        }
      })
      .catch(function (err) {
        setText($("youtubeAddError"), err.message || "Sắp xếp thất bại", true);
        return loadPlaylist();
      })
      .finally(function () {
        reorderPending = false;
      });
  }

  function bindItemDrag(li, index) {
    li.setAttribute("data-index", String(index));
    li.draggable = false;

    var handle = li.querySelector(".yt-playlist__drag");
    if (handle) {
      handle.addEventListener("mousedown", function () {
        li.draggable = true;
      });
      handle.addEventListener("touchstart", function () {
        li.draggable = true;
      }, { passive: true });
    }

    li.addEventListener("dragstart", function (e) {
      if (!li.draggable) {
        e.preventDefault();
        return;
      }
      dragFromIndex = index;
      li.classList.add("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      }
    });

    li.addEventListener("dragend", function () {
      dragFromIndex = null;
      li.draggable = false;
      clearDragIndicators();
    });

    li.addEventListener("mouseup", function () {
      if (dragFromIndex === null) li.draggable = false;
    });
  }

  function bindListDragReorder(list) {
    if (listDragBound) return;
    listDragBound = true;

    list.addEventListener("dragover", function (e) {
      if (dragFromIndex === null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      updateDragIndicators(list, e.clientY);
    });

    list.addEventListener("drop", function (e) {
      e.preventDefault();
      if (dragFromIndex === null) return;
      var from = dragFromIndex;
      var to = from;
      if (dragOverIndex !== null) {
        to = resolveDropIndex(from, dragOverIndex, dragInsertBefore);
      }
      dragFromIndex = null;
      clearDragIndicators();
      if (from !== to) {
        moveItem(from, to);
      }
    });

    list.addEventListener("dragleave", function (e) {
      if (!list.contains(e.relatedTarget)) {
        clearDragIndicators();
        if (dragFromIndex !== null) {
          var dragging = list.querySelector('.yt-playlist__item[data-index="' + dragFromIndex + '"]');
          if (dragging) dragging.classList.add("is-dragging");
        }
      }
    });
  }

  function updatePanelsVisibility() {
    var playlistPanel = $("ytPlaylistPanel");
    var dock = $("ytDock");
    var emptyEl = $("ytPlaylistEmpty");
    var hasItems = state.items.length > 0;
    var hasSelection = !!state.selectedId && hasItems;

    if (playlistPanel) playlistPanel.hidden = false;
    if (emptyEl) emptyEl.hidden = hasItems;
    if (dock) dock.hidden = !hasSelection;
    if (window.YoutubeDownloadFormats && window.YoutubeDownloadFormats.syncDockSpacer) {
      requestAnimationFrame(window.YoutubeDownloadFormats.syncDockSpacer);
    }
  }

  function findFavoriteCategory() {
    return (
      state.categories.find(function (c) {
        return c.system_key === "favorite" || (c.is_system && String(c.name || "").toLowerCase() === "favorite");
      }) || null
    );
  }

  function getUserCategories() {
    return state.categories
      .filter(function (c) {
        return !c.is_system;
      })
      .slice()
      .sort(function (a, b) {
        return (a.position || 0) - (b.position || 0) || a.id - b.id;
      });
  }

  function orderedCategoriesForTabs() {
    var fav = findFavoriteCategory();
    var users = getUserCategories();
    var out = [];
    if (fav) out.push(fav);
    return out.concat(users);
  }

  function activeCategoryId() {
    if (state.activeTab === TAB_ALL) return null;
    var id = parseInt(state.activeTab, 10);
    return id > 0 ? id : null;
  }

  function activeCategory() {
    var id = activeCategoryId();
    if (!id) return null;
    return (
      state.categories.find(function (c) {
        return c.id === id;
      }) || null
    );
  }

  function addCategoryIdForRequest() {
    var cat = activeCategory();
    if (!cat || cat.is_system) return null;
    return cat.id;
  }

  function playlistQueryUrl() {
    var cat = activeCategory();
    if (!cat) return API_BASE;
    return API_BASE + "?category_id=" + encodeURIComponent(String(cat.id));
  }

  function setActiveTab(tab) {
    state.activeTab = tab || TAB_ALL;
    savePrefs({ activeCategoryTab: state.activeTab });
    renderCategoryTabs();
    return loadPlaylist();
  }

  function syncCategoryTabsEditUi() {
    var tabsRoot = $("ytCategoryTabs");
    if (tabsRoot) {
      tabsRoot.classList.toggle("is-edit-mode", !!state.categoryTabsEditMode);
    }
    var editSwitch = $("ytCategoryEditSwitch");
    if (editSwitch) {
      editSwitch.setAttribute("aria-checked", state.categoryTabsEditMode ? "true" : "false");
    }
  }

  function setCategoryTabsEditMode(on) {
    state.categoryTabsEditMode = !!on;
    renderCategoryTabs();
  }

  function renderCategoryTabs() {
    var wrap = $("ytCategoryTabsList");
    if (!wrap) return;

    syncCategoryTabsEditUi();

    var editMode = !!state.categoryTabsEditMode;
    var tabs = [{ key: TAB_ALL, label: "All", system: true, draggable: false }];
    orderedCategoriesForTabs().forEach(function (cat) {
      tabs.push({
        key: String(cat.id),
        label: cat.system_key === "favorite" ? "Favorite" : cat.name,
        system: !!cat.is_system,
        draggable: editMode && !cat.is_system,
        id: cat.id,
      });
    });

    wrap.innerHTML = tabs
      .map(function (tab) {
        var classes = "yt-category-tabs__tab";
        if (String(state.activeTab) === String(tab.key)) classes += " is-active";
        var menu = "";
        if (editMode && !tab.system && tab.id) {
          menu =
            '<span class="yt-category-tabs__menu">' +
            '<button type="button" class="btn btn--ghost btn--sm yt-category-tabs__icon-btn" data-cat-action="rename" data-id="' +
            tab.id +
            '" title="Đổi tên" aria-label="Đổi tên">✎</button>' +
            '<button type="button" class="btn btn--ghost btn--sm yt-category-tabs__icon-btn" data-cat-action="delete" data-id="' +
            tab.id +
            '" title="Xóa" aria-label="Xóa">×</button>' +
            "</span>";
        }
        return (
          '<div class="' +
          classes +
          '" role="presentation"' +
          (tab.draggable ? ' data-cat-id="' + tab.id + '" draggable="true"' : "") +
          ">" +
          '<button type="button" class="yt-category-tabs__btn" role="tab" data-tab="' +
          escapeHtml(String(tab.key)) +
          '" aria-selected="' +
          (String(state.activeTab) === String(tab.key) ? "true" : "false") +
          '">' +
          '<span class="yt-category-tabs__label">' +
          escapeHtml(tab.label) +
          "</span>" +
          "</button>" +
          menu +
          "</div>"
        );
      })
      .join("");

    bindCategoryTabsDrag(wrap);
  }

  function renderPlaylist() {
    var list = $("ytPlaylist");
    if (!list) return;

    updatePanelsVisibility();

    if (!state.items.length) {
      list.innerHTML = "";
      return;
    }

    list.innerHTML = state.items
      .map(function (item, index) {
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
        var favClass = "btn btn--ghost btn--sm yt-playlist__fav";
        if (item.is_favorite) favClass += " is-active";
        return (
          '<li class="' +
          classes +
          '" data-id="' +
          item.id +
          '" data-index="' +
          index +
          '" role="listitem">' +
          '<span class="yt-playlist__drag" title="Kéo để sắp xếp" aria-label="Kéo để sắp xếp">' +
          ICON_DRAG +
          "</span>" +
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
          '<span class="yt-playlist__actions">' +
          '<button type="button" class="' +
          favClass +
          '" data-action="favorite" data-id="' +
          item.id +
          '" title="Favorite" aria-label="Favorite" aria-pressed="' +
          (item.is_favorite ? "true" : "false") +
          '">' +
          ICON_STAR +
          "</button>" +
          '<button type="button" class="btn btn--ghost btn--sm yt-playlist__delete" data-action="delete" data-id="' +
          item.id +
          '" title="Xóa" aria-label="Xóa">' +
          ICON_TRASH +
          "</button>" +
          "</span>" +
          "</li>"
        );
      })
      .join("");

    if (state.activeTab === TAB_ALL) {
      Array.prototype.forEach.call(list.querySelectorAll(".yt-playlist__item"), function (li, index) {
        bindItemDrag(li, index);
      });
      bindListDragReorder(list);
    } else {
      Array.prototype.forEach.call(list.querySelectorAll(".yt-playlist__drag"), function (handle) {
        handle.setAttribute("hidden", "hidden");
      });
    }
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

  function loadCategories() {
    return fetchJSON(CATEGORIES_API).then(function (data) {
      state.categories = (data && data.categories) || [];
      var prefs = readPrefs();
      var saved = prefs.activeCategoryTab;
      if (saved && saved !== TAB_ALL) {
        var exists = state.categories.some(function (c) {
          return String(c.id) === String(saved);
        });
        state.activeTab = exists ? String(saved) : TAB_ALL;
      } else if (saved === TAB_ALL) {
        state.activeTab = TAB_ALL;
      }
      renderCategoryTabs();
      updatePanelsVisibility();
      return state.categories;
    });
  }

  function loadPlaylist() {
    return fetchJSON(playlistQueryUrl()).then(function (data) {
      state.items = (data && data.items) || [];
      renderPlaylist();
      if (window.YoutubeDownloadPlayer) {
        window.YoutubeDownloadPlayer.setPlaylist(state.items);
      }
      return state.items;
    });
  }

  function toggleFavorite(id) {
    return fetchJSON(API_BASE + "/" + id + "/favorite", { method: "POST" }).then(function (item) {
      if (!item) return null;
      var fav = findFavoriteCategory();
      var onFavTab = fav && String(state.activeTab) === String(fav.id);
      if (onFavTab && !item.is_favorite) {
        return loadPlaylist();
      }
      upsertItem(item);
      renderPlaylist();
      return item;
    });
  }

  function createCategory(name, options) {
    options = options || {};
    return fetchJSON(CATEGORIES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name }),
    }).then(function (cat) {
      return loadCategories().then(function () {
        if (options.skipActivate) return cat;
        if (cat && cat.id) {
          return setActiveTab(String(cat.id)).then(function () {
            return cat;
          });
        }
        return cat;
      });
    });
  }

  function userCategoriesForAssign() {
    return (state.categories || []).filter(function (c) {
      return c && !c.is_system;
    });
  }

  function itemCategoryIds(item) {
    if (!item || !Array.isArray(item.category_ids)) return [];
    return item.category_ids;
  }

  function isCategoryAssignMenuOpen() {
    var menu = $("ytCategoryAssignMenu");
    return !!(menu && !menu.hidden);
  }

  function closeCategoryAssignMenu() {
    var menu = $("ytCategoryAssignMenu");
    var btn = $("ytCategoryAssignBtn");
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function renderCategoryAssignMenu() {
    var list = $("ytCategoryAssignList");
    if (!list) return;
    var item = getSelectedItem();
    var cats = userCategoriesForAssign();
    var ids = itemCategoryIds(item);
    if (!cats.length) {
      list.innerHTML = '<p class="yt-category-assign__empty">Chưa có category. Tạo mới bên dưới.</p>';
      return;
    }
    list.innerHTML = cats
      .map(function (cat) {
        var checked = ids.indexOf(cat.id) >= 0;
        return (
          '<label class="yt-category-assign__item" role="menuitemcheckbox" aria-checked="' +
          (checked ? "true" : "false") +
          '">' +
          '<input type="checkbox" data-category-id="' +
          cat.id +
          '"' +
          (checked ? " checked" : "") +
          " />" +
          '<span class="yt-category-assign__item-label">' +
          escapeHtml(cat.name) +
          "</span>" +
          "</label>"
        );
      })
      .join("");
  }

  function openCategoryAssignMenu() {
    var menu = $("ytCategoryAssignMenu");
    var btn = $("ytCategoryAssignBtn");
    if (!menu || !btn || btn.hidden) return;
    if (!state.selectedId) return;
    renderCategoryAssignMenu();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }

  function toggleCategoryAssignMenu() {
    if (isCategoryAssignMenuOpen()) {
      closeCategoryAssignMenu();
      return;
    }
    openCategoryAssignMenu();
  }

  function afterCategoryMembershipChange(item, categoryId, linked) {
    if (!item) return Promise.resolve(null);
    upsertItem(item);
    if (!linked && String(state.activeTab) === String(categoryId)) {
      var selectedId = state.selectedId;
      return loadPlaylist().then(function () {
        var stillThere = findItemById(selectedId);
        if (!stillThere) {
          closeCategoryAssignMenu();
          state.selectedId = null;
          state.formats = [];
          state.selectedFormatId = null;
          savePrefs({ selectedItemId: null });
          updateFormatPreview(null);
          if (window.YoutubeDownloadFormats) {
            window.YoutubeDownloadFormats.reset();
          }
          updatePanelsVisibility();
          return item;
        }
        if (isCategoryAssignMenuOpen()) renderCategoryAssignMenu();
        return item;
      });
    }
    renderPlaylist();
    if (isCategoryAssignMenuOpen()) renderCategoryAssignMenu();
    return Promise.resolve(item);
  }

  function linkItemCategory(itemId, categoryId) {
    return fetchJSON(API_BASE + "/" + itemId + "/categories/" + categoryId, {
      method: "POST",
    }).then(function (item) {
      return afterCategoryMembershipChange(item, categoryId, true);
    });
  }

  function unlinkItemCategory(itemId, categoryId) {
    return fetchJSON(API_BASE + "/" + itemId + "/categories/" + categoryId, {
      method: "DELETE",
    }).then(function (item) {
      return afterCategoryMembershipChange(item, categoryId, false);
    });
  }

  function createCategoryAndLinkSelected(name) {
    var itemId = state.selectedId;
    if (!itemId) return Promise.resolve(null);
    return createCategory(name, { skipActivate: true }).then(function (cat) {
      if (!cat || !cat.id) return null;
      return linkItemCategory(itemId, cat.id);
    });
  }

  function bindCategoryAssignMenu() {
    if (assignMenuBound) return;
    assignMenuBound = true;

    var btn = $("ytCategoryAssignBtn");
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleCategoryAssignMenu();
      });
    }

    var menu = $("ytCategoryAssignMenu");
    if (menu) {
      menu.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      menu.addEventListener("change", function (e) {
        var input = e.target;
        if (!input || input.type !== "checkbox") return;
        var categoryId = parseInt(input.getAttribute("data-category-id"), 10);
        var itemId = state.selectedId;
        if (!categoryId || !itemId) return;
        var wantLinked = !!input.checked;
        var req = wantLinked ? linkItemCategory(itemId, categoryId) : unlinkItemCategory(itemId, categoryId);
        req.catch(function (err) {
          input.checked = !wantLinked;
          setText($("youtubeAddError"), err.message || "Cập nhật category thất bại", true);
        });
      });
    }

    var createBtn = $("ytCategoryAssignCreate");
    if (createBtn) {
      createBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var name = window.prompt("Tên category mới:");
        if (name == null) return;
        name = String(name).trim();
        if (!name) return;
        createCategoryAndLinkSelected(name).catch(function (err) {
          setText($("youtubeAddError"), err.message || "Tạo category thất bại", true);
        });
      });
    }

    document.addEventListener("click", function (e) {
      if (!isCategoryAssignMenuOpen()) return;
      var wrap = e.target.closest(".yt-category-assign-wrap");
      if (wrap) return;
      closeCategoryAssignMenu();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isCategoryAssignMenuOpen()) {
        closeCategoryAssignMenu();
      }
    });
  }

  function renameCategory(id, name) {
    return fetchJSON(CATEGORIES_API + "/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name }),
    }).then(function () {
      return loadCategories();
    });
  }

  function deleteCategory(id) {
    return fetchJSON(CATEGORIES_API + "/" + id, { method: "DELETE" }).then(function () {
      if (String(state.activeTab) === String(id)) {
        state.activeTab = TAB_ALL;
        savePrefs({ activeCategoryTab: TAB_ALL });
      }
      return loadCategories().then(function () {
        return loadPlaylist();
      });
    });
  }

  function moveCategory(fromId, toIndexAmongOrdered) {
    if (catReorderPending) return Promise.resolve();
    var ordered = orderedCategoriesForTabs();
    var fromIdx = -1;
    for (var i = 0; i < ordered.length; i++) {
      if (ordered[i].id === fromId) {
        fromIdx = i;
        break;
      }
    }
    if (fromIdx < 0) return Promise.resolve();
    var toIdx = toIndexAmongOrdered;
    if (toIdx < 0) toIdx = 0;
    if (toIdx >= ordered.length) toIdx = ordered.length - 1;
    if (fromIdx === toIdx) return Promise.resolve();

    var moved = ordered[fromIdx];
    if (moved.is_system) return Promise.resolve();

    catReorderPending = true;
    return fetchJSON(CATEGORIES_API + "/" + fromId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: toIdx }),
    })
      .then(function () {
        return loadCategories();
      })
      .catch(function (err) {
        setText($("youtubeAddError"), err.message || "Sắp xếp category thất bại", true);
        return loadCategories();
      })
      .finally(function () {
        catReorderPending = false;
      });
  }

  function bindCategoryTabsDrag(wrap) {
    if (!wrap || catTabsDragBound) return;
    catTabsDragBound = true;

    wrap.addEventListener("dragstart", function (e) {
      if (!state.categoryTabsEditMode) {
        e.preventDefault();
        return;
      }
      var tab = e.target.closest(".yt-category-tabs__tab[data-cat-id]");
      if (!tab || !wrap.contains(tab)) return;
      catDragFromId = parseInt(tab.getAttribute("data-cat-id"), 10);
      tab.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", String(catDragFromId));
      } catch (err) {
        /* ignore */
      }
    });

    wrap.addEventListener("dragend", function () {
      Array.prototype.forEach.call(wrap.querySelectorAll(".yt-category-tabs__tab"), function (el) {
        el.classList.remove("is-dragging", "is-drag-over-before", "is-drag-over-after");
      });
      catDragFromId = null;
      catDragOverId = null;
    });

    wrap.addEventListener("dragover", function (e) {
      if (catDragFromId == null) return;
      var tab = e.target.closest(".yt-category-tabs__tab[data-cat-id]");
      if (!tab || !wrap.contains(tab)) return;
      e.preventDefault();
      var overId = parseInt(tab.getAttribute("data-cat-id"), 10);
      if (!overId || overId === catDragFromId) return;
      var rect = tab.getBoundingClientRect();
      catDragInsertBefore = e.clientX < rect.left + rect.width / 2;
      catDragOverId = overId;
      Array.prototype.forEach.call(wrap.querySelectorAll(".yt-category-tabs__tab"), function (el) {
        el.classList.remove("is-drag-over-before", "is-drag-over-after");
      });
      tab.classList.add(catDragInsertBefore ? "is-drag-over-before" : "is-drag-over-after");
    });

    wrap.addEventListener("drop", function (e) {
      e.preventDefault();
      if (catDragFromId == null || catDragOverId == null) return;
      var ordered = orderedCategoriesForTabs();
      var toIdx = -1;
      for (var i = 0; i < ordered.length; i++) {
        if (ordered[i].id === catDragOverId) {
          toIdx = i;
          break;
        }
      }
      if (toIdx < 0) return;
      if (!catDragInsertBefore) toIdx += 1;
      var fromIdx = -1;
      for (var j = 0; j < ordered.length; j++) {
        if (ordered[j].id === catDragFromId) {
          fromIdx = j;
          break;
        }
      }
      if (fromIdx >= 0 && toIdx > fromIdx) toIdx -= 1;
      moveCategory(catDragFromId, toIdx);
    });
  }

  function selectItem(id, formatsFromAdd, options) {
    options = options || {};
    closeCategoryAssignMenu();
    state.selectedId = id;
    state.selectedFormatId = null;
    savePrefs({ selectedItemId: id || null });
    renderPlaylist();
    updatePanelsVisibility();

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

    var body = { url: url };
    var categoryId = addCategoryIdForRequest();
    if (categoryId) body.category_id = categoryId;

    var fav = findFavoriteCategory();
    var onFavTab = fav && String(state.activeTab) === String(fav.id);

    return fetchJSON(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (data) {
        var item = data && data.item;
        setText(statusEl, "Đã thêm vào playlist.", false);
        if (onFavTab) {
          return setActiveTab(TAB_ALL).then(function () {
            if (item) return selectItem(item.id, data.formats || []);
          });
        }
        if (item) {
          if (categoryId) {
            return loadPlaylist().then(function () {
              return selectItem(item.id, data.formats || []);
            });
          }
          upsertItem(item);
          renderPlaylist();
          return selectItem(item.id, data.formats || []);
        }
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
          updatePanelsVisibility();
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

  function streamUrl(itemId, formatId) {
    if (!itemId || !formatId) return "";
    return API_BASE + "/" + itemId + "/stream?format_id=" + encodeURIComponent(formatId);
  }

  function downloadUrl(itemId, formatId) {
    if (!itemId || !formatId) return "";
    return API_BASE + "/" + itemId + "/download?format_id=" + encodeURIComponent(formatId);
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

    var addCatBtn = $("ytCategoryAddBtn");
    if (addCatBtn) {
      addCatBtn.addEventListener("click", function () {
        var name = window.prompt("Tên category mới:");
        if (name == null) return;
        name = String(name).trim();
        if (!name) return;
        createCategory(name).catch(function (err) {
          setText($("youtubeAddError"), err.message || "Tạo category thất bại", true);
        });
      });
    }

    var editSwitch = $("ytCategoryEditSwitch");
    if (editSwitch) {
      editSwitch.addEventListener("click", function () {
        setCategoryTabsEditMode(!state.categoryTabsEditMode);
      });
    }
    var editLabel = $("ytCategoryEditLabel");
    if (editLabel && editSwitch) {
      editLabel.addEventListener("click", function () {
        setCategoryTabsEditMode(!state.categoryTabsEditMode);
      });
    }

    var tabsList = $("ytCategoryTabsList");
    if (tabsList) {
      tabsList.addEventListener("click", function (e) {
        var actionBtn = e.target.closest("[data-cat-action]");
        if (actionBtn) {
          e.preventDefault();
          e.stopPropagation();
          var catId = parseInt(actionBtn.getAttribute("data-id"), 10);
          if (!catId) return;
          var action = actionBtn.getAttribute("data-cat-action");
          if (action === "rename") {
            var current = state.categories.find(function (c) {
              return c.id === catId;
            });
            var nextName = window.prompt("Đổi tên category:", current ? current.name : "");
            if (nextName == null) return;
            nextName = String(nextName).trim();
            if (!nextName) return;
            renameCategory(catId, nextName).catch(function (err) {
              setText($("youtubeAddError"), err.message || "Đổi tên thất bại", true);
            });
            return;
          }
          if (action === "delete") {
            if (!window.confirm("Xóa category này? Video vẫn còn trong All.")) return;
            deleteCategory(catId).catch(function (err) {
              setText($("youtubeAddError"), err.message || "Xóa category thất bại", true);
            });
            return;
          }
        }

        var tabBtn = e.target.closest("[data-tab]");
        if (!tabBtn || !tabsList.contains(tabBtn)) return;
        var tab = tabBtn.getAttribute("data-tab");
        if (!tab || String(tab) === String(state.activeTab)) return;
        setActiveTab(tab).catch(function (err) {
          setText($("youtubeAddError"), err.message || "Không tải được playlist", true);
        });
      });
    }

    var list = $("ytPlaylist");
    if (list) {
      list.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-action]");
        if (!btn) return;
        var id = parseInt(btn.getAttribute("data-id"), 10);
        if (!id) return;
        var action = btn.getAttribute("data-action");
        if (action === "select") {
          selectItem(id);
        } else if (action === "delete") {
          if (!window.confirm("Xóa video này khỏi playlist?")) return;
          deleteItem(id).catch(function (err) {
            setText($("youtubeAddError"), err.message || "Xóa thất bại", true);
          });
        } else if (action === "favorite") {
          toggleFavorite(id).catch(function (err) {
            setText($("youtubeAddError"), err.message || "Favorite thất bại", true);
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
    if (prefs.activeCategoryTab) {
      state.activeTab = String(prefs.activeCategoryTab);
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
        streamUrl: streamUrl,
        downloadUrl: downloadUrl,
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
    bindCategoryAssignMenu();
    loadCategories()
      .then(function () {
        return loadPlaylist();
      })
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
    streamUrl: streamUrl,
    downloadUrl: downloadUrl,
  };
})();
