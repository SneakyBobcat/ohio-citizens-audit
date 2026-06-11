// sw.js — Ohio Citizen's Audit service worker
//
// Strategy, chosen to never serve a stale deploy:
//   • Navigations (the HTML shell): NETWORK-FIRST. A new Netlify deploy is
//     picked up on the next load; the cached shell is used only when offline.
//     The shell carries the embedded fallback data, so offline still shows
//     a complete app.
//   • Netlify functions (live data): NETWORK-FIRST with cached fallback, so
//     the most recent successful data appears if the network drops.
//   • Static assets (icons, fonts): STALE-WHILE-REVALIDATE for instant loads.
//
// Bump VERSION on any strategy change to retire old caches.

var VERSION      = 'oca-v1';
var SHELL_CACHE  = VERSION + '-shell';
var DATA_CACHE   = VERSION + '-data';
var STATIC_CACHE = VERSION + '-static';

var PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(VERSION) !== 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // 1) App shell navigations: network-first, cache fallback
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { c.put('/', copy); });
        return res;
      }).catch(function () {
        return caches.match('/');
      })
    );
    return;
  }

  // 2) Live data from Netlify functions: network-first, last-good fallback
  if (url.origin === location.origin && url.pathname.indexOf('/.netlify/functions/') === 0) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(DATA_CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || Response.error();
        });
      })
    );
    return;
  }

  // 3) Same-origin static assets + Google Fonts: stale-while-revalidate
  var isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin === location.origin || isFont) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        var refresh = fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) {
            var copy = res.clone();
            caches.open(STATIC_CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || refresh;
      })
    );
  }
  // Everything else (e.g., cross-origin portrait fallbacks): default browser handling.
});
