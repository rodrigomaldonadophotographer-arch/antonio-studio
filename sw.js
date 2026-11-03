const CACHE_NAME = 'antonio-studio-v1';
const APP_FILES = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/supabase-config.js',
  './manifest.webmanifest',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/interior-salon.png',
  './images/logo-perfil-origen.png',
  './images/referencia-color.png',
  './images/referencia-cortes.png',
  './images/referencia-eventos.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('antonio-studio-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/admin.html') || url.pathname.endsWith('/admin.js') || url.pathname.endsWith('/admin.css')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    });
  }));
});
