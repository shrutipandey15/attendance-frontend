// Service Worker for Attendance Guardian PWA
const CACHE_NAME = 'attendance-guardian-v1';
const RUNTIME_CACHE = 'runtime-cache';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/admin',
  '/manifest.json'
];

// Install event - precache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip Appwrite API requests (always need fresh data)
  if (url.hostname.includes('appwrite.io')) {
    return;
  }

  // Network-first strategy for HTML/API requests
  if (request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone response to cache it
          const responseToCache = response.clone();

          caches.open(RUNTIME_CACHE)
            .then((cache) => {
              cache.put(request, responseToCache);
            });

          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                console.log('[SW] Serving from cache:', request.url);
                return cachedResponse;
              }

              // Return offline page for navigation requests
              if (request.mode === 'navigate') {
                return caches.match('/');
              }

              return new Response('Offline - No cached version available', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
  }
});

// Background sync for failed requests (future enhancement)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'sync-attendance') {
    event.waitUntil(
      // Implement sync logic here
      Promise.resolve()
    );
  }
});

// Push notification support (future enhancement)
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Attendance Guardian';
  const options = {
    body: data.body || 'New notification',
    icon: '/window.svg',
    badge: '/window.svg',
    vibrate: [200, 100, 200],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');

  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});
