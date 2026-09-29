// Service worker baxdev: shell offline ringan. API, Firebase, dan Roblox TIDAK pernah di-cache.
const CACHE = "baxdev-shell-v1";
const SHELL = ["/", "/favicon-192.png", "/logo.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;       // Firebase / CDN / Roblox: langsung ke jaringan
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/owner")) return;
  // Halaman: jaringan dulu (supaya update & maintenance selalu terbaru), cache kalau offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put("/", cp)); return res; })
        .catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }
  // Aset statis: cache dulu, perbarui di belakang
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
