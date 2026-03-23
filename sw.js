/* ═══════════════════════════════════════════════════════════
   LUMINARY — sw.js
   T-38: Service Worker + caching
   Strategy: Cache-first for assets, network-first for quotes.json
   so quote updates are picked up on next visit when online.
═══════════════════════════════════════════════════════════ */

const CACHE_NAME    = 'luminary-v1';
const CACHE_ASSETS  = 'luminary-assets-v1';
const CACHE_DATA    = 'luminary-data-v1';

/* Files to pre-cache on install */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/quote-service.js',
  '/quotes.json',
  '/manifest.json',
  '/assets/logo.svg',
  '/assets/favicon.svg',
];

/* ─────────────────────────────────────
   INSTALL — pre-cache all core assets
───────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_ASSETS)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

/* ─────────────────────────────────────
   ACTIVATE — clean up old caches
───────────────────────────────────── */
self.addEventListener('activate', event => {
  const validCaches = [CACHE_ASSETS, CACHE_DATA];

  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !validCaches.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // take control immediately
  );
});

/* ─────────────────────────────────────
   FETCH — routing strategy
───────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // quotes.json → network-first (get updates when online, fall back to cache)
  if (url.pathname.endsWith('quotes.json')) {
    event.respondWith(networkFirst(request, CACHE_DATA));
    return;
  }

  // Everything else → cache-first (fast loads, works offline)
  event.respondWith(cacheFirst(request, CACHE_ASSETS));
});

/* ─────────────────────────────────────
   STRATEGIES
───────────────────────────────────── */

// Cache-first: serve from cache, fall back to network, update cache
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached — return a fallback if available
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Offline', { status: 503 });
  }
}

// Network-first: try network, fall back to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
