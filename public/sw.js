const CACHE_NAME = 'zakupy-cache-v11';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.css',
  'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn(`SW: Zignorowano plik -> ${url}`, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Zapytania do zewnętrznych baz i API nie podlegają pamięci podręcznej
  if (
    url.includes('firebasedatabase.app') ||
    url.includes('generativelanguage.googleapis.com') ||
    url.includes('open-meteo.com') ||
    url.includes('bigdatacloud.net')
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      return (
        cached ||
        fetch(e.request)
          .then((res) => {
            return caches.open(CACHE_NAME).then((cache) => {
              if (e.request.method === 'GET') {
                cache.put(e.request, res.clone());
              }
              return res;
            });
          })
          .catch(() => caches.match('/index.html'))
      );
    })
  );
});

