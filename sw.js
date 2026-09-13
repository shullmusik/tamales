/* ==========================================================================
   Tamalitos — Service Worker
   ---------------------------------------------------------------------------
   Estrategia:
   · App shell precacheado con URLs VERSIONADAS (?v=…) y descarga forzada desde
     la red (cache:'reload'), para que nunca se mezclen archivos de dos versiones.
   · Navegaciones (index.html): red primero, sin caché HTTP; si no hay señal,
     la copia guardada.
   · Archivos estáticos versionados: caché primero (son inmutables), red si faltan.
   Al publicar una versión nueva, cambia VERSION aquí y el ?v= de index.html
   (o corre `node tools/release.mjs <versión>`, que hace las dos cosas).
   ========================================================================== */

var VERSION = '2.3.0';
var CACHE = 'tamalitos-' + VERSION;

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './css/app.css?v=' + VERSION,
  './js/core/money.js?v=' + VERSION,
  './js/core/units.js?v=' + VERSION,
  './js/core/store.js?v=' + VERSION,
  './js/core/costing.js?v=' + VERSION,
  './js/core/plan.js?v=' + VERSION,
  './js/core/billing.js?v=' + VERSION,
  './js/verticals/tamales.js?v=' + VERSION,
  './js/ui/common.js?v=' + VERSION,
  './js/ui/ventas.js?v=' + VERSION,
  './js/ui/productos.js?v=' + VERSION,
  './js/ui/insumos.js?v=' + VERSION,
  './js/ui/ganancias.js?v=' + VERSION,
  './js/ui/pro.js?v=' + VERSION,
  './js/app.js?v=' + VERSION
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // cache:'reload' salta la caché HTTP del navegador y del CDN de GitHub Pages
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' }));
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // wa.me y terceros: no se tocan

  // Navegaciones: siempre la versión más reciente de index.html; sin señal, la guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
        .then(function (res) {
          if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('./index.html', copy); }); }
          return res;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (hit) { return hit || caches.match('./'); });
        })
    );
    return;
  }

  // Estáticos: caché primero (las URLs versionadas son inmutables); si no está, red y guardar.
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
