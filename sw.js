/* KCO — Centro Operativo Personal — service worker */
'use strict';

var VERSION = '1.0.2';
var CACHE = 'kibco-v13';

var ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icono-192.png',
  './icono-512.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ARCHIVOS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nombres) {
      var borrados = [];
      var i;
      for (i = 0; i < nombres.length; i++) {
        var n = nombres[i];
        /* Solo tocamos cache de KCO. Nunca kibo- (KF) ni kibolab- (LAB). */
        if (n.indexOf('kibco-') === 0 && n !== CACHE) {
          borrados.push(caches.delete(n));
        }
      }
      return Promise.all(borrados);
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (ev) {
  if (ev.data && ev.data.tipo === 'version' && ev.ports && ev.ports[0]) {
    ev.ports[0].postMessage({ version: VERSION, cache: CACHE });
  }
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') { return; }
  if (req.url.indexOf('http') !== 0) { return; }

  ev.respondWith(
    caches.match(req).then(function (cacheada) {
      if (cacheada) { return cacheada; }
      return fetch(req).then(function (resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var copia = resp.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(req, copia);
          });
        }
        return resp;
      }).catch(function () {
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503, statusText: 'Sin conexion' });
      });
    })
  );
});
