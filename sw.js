/* KCO — Centro Operativo Personal — service worker */
'use strict';

/* Una sola version por release: tiene que coincidir con VERSION_APP de
   kco-app.js y "version" de package.json (lo controla tests/unit/version.test.js).
   El nombre de la cache sale de aca: subir la version cambia los bytes de sw.js,
   el navegador detecta la actualizacion y la cache nueva reemplaza a la vieja. */
var VERSION = '2.1.0';
var CACHE = 'kibco-' + VERSION;

var ARCHIVOS = [
  './',
  './index.html',
  './kco.css',
  './tema.js',
  './iconos.js',
  './kco-core.js',
  './kco-app.js',
  './manifest.webmanifest',
  './icono-180.png',
  './icono-192.png',
  './icono-512.png',
  './icono-maskable-512.png'
];

/* Sin skipWaiting en install: una version nueva espera hasta que la persona
   toca "Actualizar" (mensaje SKIP_WAITING). La primera instalacion se activa
   sola porque no hay otra version controlando. */
self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* cache: 'reload' saltea la cache HTTP: una version nueva nunca se arma
         con archivos viejos que el navegador tenia guardados. */
      var pedidos = [], i;
      for (i = 0; i < ARCHIVOS.length; i++) {
        pedidos.push(new Request(ARCHIVOS[i], { cache: 'reload' }));
      }
      return cache.addAll(pedidos);
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
  if (!ev.data) { return; }
  if (ev.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (ev.data.tipo === 'version' && ev.ports && ev.ports[0]) {
    ev.ports[0].postMessage({ version: VERSION, cache: CACHE });
  }
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') { return; }
  if (req.url.indexOf('http') !== 0) { return; }

  /* Una navegacion con query (p. ej. el atajo ./?capturar=1) es la misma app. */
  var opciones = req.mode === 'navigate' ? { ignoreSearch: true } : undefined;
  ev.respondWith(
    caches.match(req, opciones).then(function (cacheada) {
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
