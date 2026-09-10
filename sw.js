const CACHE_NAME = 'watchdog-pwa-v1.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './css/rider.css',
  './css/admin.css',
  './js/firebase-config.js',
  './js/store.js',
  './js/auth.js',
  './js/rider-portal.js',
  './js/admin-portal.js',
  './js/app.js',
  './assets/logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Service worker pre-caching non-fatal warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // For Firebase API / Firestore streams or external DB calls, use Network First
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('firebaseapp.com') ||
      event.request.url.includes('googleapis.com')) {
    return; // allow browser / SDK to handle directly
  }

  // Network First with Cache Fallback for static assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
