// Service Worker for Catan Map Generator PWA
//
// Strategy:
//  - HTML / JS / CSS / JSON  → NETWORK-FIRST. The fresh copy is served and
//    written to the cache; the cache is only used when the network fails
//    (offline). A deploy is therefore visible on the very next load.
//  - Images / SVG / fonts     → CACHE-FIRST (they are versioned by filename
//    or ?v= and rarely change).
//
// CACHE_NAME is stamped by ./deploy.sh on every deploy, so old caches are
// swept in `activate` even if a stale entry ever slipped through.
const CACHE_NAME = 'catan-gen-20260908-122705';
const PRECACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/generator-core.js',
  '/style.css',
  '/manifest.json',
  '/assets/brick.svg',
  '/assets/desert.svg',
  '/assets/ore.svg',
  '/assets/sheep.svg',
  '/assets/wheat.svg',
  '/assets/wood.svg',
];

const NETWORK_FIRST = /\.(html|js|css|json|xml|txt)(\?.*)?$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Precache best-effort: one missing file must not block the update.
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function isNetworkFirst(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  return url.pathname === '/' || NETWORK_FIRST.test(url.pathname + url.search);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('/index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200 && response.type === 'basic') {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Only handle same-origin requests; analytics etc. go straight through.
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(isNetworkFirst(request) ? networkFirst(request) : cacheFirst(request));
});
