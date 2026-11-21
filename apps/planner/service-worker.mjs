/* global self, caches */
const base = self.registration.scope;
const prefix = `draconis-planner:${base}:`;
const cacheName = prefix + __PLANNER_VERSION__;
const assets = new Set(__PLANNER_ASSETS__.map(file => new URL(file, base).href));
const entry = new URL('index.html', base).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([entry, ...assets])));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const navigation = request.mode === 'navigate' && [base, entry].includes(request.url.split('?')[0]);
  if (navigation) {
    event.respondWith(fetch(request).catch(async error => {
      const cached = await (await caches.open(cacheName)).match(entry);
      if (cached) return cached;
      throw error;
    }));
  } else if (assets.has(request.url)) {
    event.respondWith(caches.open(cacheName).then(async cache => await cache.match(request) ?? fetch(request)));
  }
});
