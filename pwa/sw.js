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
 *   · Tipografía de marca (Google Fonts) → se guarda aparte la primera vez,
 *     para que la letra corporativa se vea también sin internet.
 *   · Todo lo demás (la API de Apps Script, en otro dominio) → sin tocar:
 *     el JSONP tiene que salir a la red, y los POST tampoco se cachean.
 *
 * Al cambiar la app de forma importante, sube el número de VERSION.
 */
const VERSION = 'fifo-v3';
const FUENTES = 'fifo-fuentes-v1';
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

/* Dominios de la tipografía corporativa (Plus Jakarta Sans). */
function esFuente(host) {
  return /(^|\.)fonts\.googleapis\.com$/.test(host) ||
         /(^|\.)fonts\.gstatic\.com$/.test(host);
}

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
        nombres.filter(n => n !== VERSION && n !== FUENTES).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const peticion = evento.request;
  const url = new URL(peticion.url);

  /* Tipografía de marca: se responde de la copia guardada y, si no está, se
     baja una vez y queda en la caché de fuentes (que no se borra al subir
     la versión de la app). */
  if (esFuente(url.hostname)) {
    evento.respondWith(
      caches.open(FUENTES).then(c => c.match(peticion).then(guardada => {
        if (guardada) return guardada;
        return fetch(peticion).then(respuesta => {
          if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) {
            c.put(peticion, respuesta.clone());
          }
          return respuesta;
        }).catch(() => guardada);
      }))
    );
    return;
  }

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
