(function () {
  "use strict";

  var CACHE_CHUNKS = "yt-stream-chunks-v1";
  var CACHE_META = "yt-stream-meta-v1";
  var TTL_MS = 6 * 60 * 60 * 1000;
  var MAX_STREAMS = 15;
  var STREAM_PATH_RE = /^\/api\/youtube-download\/playlist\/\d+\/stream$/;

  self.addEventListener("install", function (event) {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", function (event) {
    event.waitUntil(
      purgeExpired()
        .catch(function () {})
        .then(function () {
          return self.clients.claim();
        })
    );
  });

  self.addEventListener("fetch", function (event) {
    var request = event.request;
    if (request.method !== "GET" && request.method !== "HEAD") return;
    var url;
    try {
      url = new URL(request.url);
    } catch (err) {
      return;
    }
    if (url.origin !== self.location.origin) return;
    if (!STREAM_PATH_RE.test(url.pathname)) return;

    event.respondWith(handleStreamFetch(request));
  });

  function streamBaseHref(url) {
    return url.origin + url.pathname + url.search;
  }

  function syntheticRequest(request) {
    var url = new URL(request.url);
    var range = request.headers.get("Range") || "";
    var sep = url.search ? "&" : "?";
    return new Request(url.href + sep + "__sw_range=" + encodeURIComponent(range), {
      method: request.method,
    });
  }

  function handleStreamFetch(request) {
    var url = new URL(request.url);
    var baseHref = streamBaseHref(url);
    var cacheReq = syntheticRequest(request);

    return purgeExpired()
      .catch(function () {})
      .then(function () {
        return caches.open(CACHE_CHUNKS);
      })
      .then(function (chunkCache) {
        return chunkCache.match(cacheReq).then(function (cached) {
          if (cached) return cached;
          return fetch(request).then(function (networkResponse) {
            if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 206)) {
              return networkResponse;
            }
            var toStore = networkResponse.clone();
            return ensureMeta(baseHref)
              .then(function () {
                return chunkCache.put(cacheReq, toStore);
              })
              .then(function () {
                return enforceMaxStreams();
              })
              .catch(function () {})
              .then(function () {
                return networkResponse;
              });
          });
        });
      });
  }

  function ensureMeta(baseHref) {
    return caches.open(CACHE_META).then(function (metaCache) {
      return metaCache.match(baseHref).then(function (existing) {
        if (existing) return;
        var body = JSON.stringify({ cachedAt: Date.now() });
        return metaCache.put(
          baseHref,
          new Response(body, {
            headers: { "Content-Type": "application/json" },
          })
        );
      });
    });
  }

  function readMetaEntry(response) {
    if (!response) return Promise.resolve(null);
    return response
      .json()
      .then(function (data) {
        if (!data || typeof data.cachedAt !== "number") return null;
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function listMetaEntries() {
    return caches.open(CACHE_META).then(function (metaCache) {
      return metaCache.keys().then(function (keys) {
        return Promise.all(
          keys.map(function (req) {
            return metaCache.match(req).then(function (res) {
              return readMetaEntry(res).then(function (data) {
                return { request: req, href: req.url, data: data };
              });
            });
          })
        ).then(function (entries) {
          return entries.filter(function (e) {
            return e.data;
          });
        });
      });
    });
  }

  function deleteStreamChunks(baseHref) {
    return caches.open(CACHE_CHUNKS).then(function (chunkCache) {
      return chunkCache.keys().then(function (keys) {
        var toDelete = keys.filter(function (req) {
          return isChunkForBase(req.url, baseHref);
        });
        return Promise.all(
          toDelete.map(function (req) {
            return chunkCache.delete(req);
          })
        );
      });
    });
  }

  function isChunkForBase(chunkUrl, baseHref) {
    if (chunkUrl === baseHref) return true;
    if (chunkUrl.indexOf(baseHref + "&__sw_range=") === 0) return true;
    if (chunkUrl.indexOf(baseHref + "?__sw_range=") === 0) return true;
    return false;
  }

  function deleteStream(baseHref) {
    return Promise.all([
      caches.open(CACHE_META).then(function (metaCache) {
        return metaCache.delete(baseHref);
      }),
      deleteStreamChunks(baseHref),
    ]);
  }

  function purgeExpired() {
    var now = Date.now();
    return listMetaEntries().then(function (entries) {
      var expired = entries.filter(function (e) {
        return now - e.data.cachedAt > TTL_MS;
      });
      return Promise.all(
        expired.map(function (e) {
          return deleteStream(e.href);
        })
      );
    });
  }

  function enforceMaxStreams() {
    return listMetaEntries().then(function (entries) {
      if (entries.length <= MAX_STREAMS) return;
      entries.sort(function (a, b) {
        return a.data.cachedAt - b.data.cachedAt;
      });
      var excess = entries.length - MAX_STREAMS;
      var victims = entries.slice(0, excess);
      return Promise.all(
        victims.map(function (e) {
          return deleteStream(e.href);
        })
      );
    });
  }
})();
