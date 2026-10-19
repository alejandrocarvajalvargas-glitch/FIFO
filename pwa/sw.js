/**
 * sw.js — service worker de la app instalable FIFO.
 *
 * Su único trabajo es que la app ABRA aunque no haya datos: guarda en caché el
 * armazón (la página y los iconos). Los datos siempre vienen del servidor.
 *
 * Estrategia:
 *   · Navegación (abrir la app)  → primero la red; si no hay, la copia guardada.
 *     Así, cuando hay internet, siempre se ve la última versión publicada.
 *   · Recursos propios (iconos)  → primero la caché.
 *   · Todo lo demás (la API de Apps Script, en otro dominio) → sin tocar:
 *     el JSONP tiene que salir a la red, y los POST tampoco se cachean.
 *
 * Al cambiar la app de forma importante, sube el número de VERSION.
 */
const VERSION = 'fifo-v1';
const ARMAZON = [
  './',
  './index.html',
  './manifest.json',
  './icono-96.png',
  './icono-144.png',
  './icono-192.png',
  './icono-512.png',
  './icono-maskable-512.png',
  './icono-180.png'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ARMAZON))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(
        nombres.filter(n => n !== VERSION).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const peticion = evento.request;
  const url = new URL(peticion.url);

  /* La API vive en script.google.com: no se intercepta nunca. */
  if (url.origin !== self.location.origin) return;
  if (peticion.method !== 'GET') return;

  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then(respuesta => {
          const copia = respuesta.clone();
          caches.open(VERSION).then(c => c.put(peticion, copia));
          return respuesta;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  evento.respondWith(
    caches.match(peticion).then(guardada => guardada || fetch(peticion))
  );
});
