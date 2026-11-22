self.addEventListener("install", event => {
  event.waitUntil(caches.open(version).then(cache => cache.addAll(shell)));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("snap2fix-shell-") && key !== version) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" && /^\/dashboard(?:\/|$)/.test(url.pathname)) {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(version)).match("/index.html")));
  } else if (shell.includes(url.pathname) && url.pathname !== "/index.html") {
    event.respondWith(caches.open(version).then(async cache => await cache.match(url.pathname) || fetch(event.request)));
  }
});
