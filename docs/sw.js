const SHELL_CACHE = "op-shell-v6";
const IMG_CACHE = "op-img-v1";
const EXTERNAL_IMG_HOSTS = ["images.pokemontcg.io", "www.dbs-cardgame.com"];

const SHELL_FILES = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "qrcode.js",
  "manifest.webmanifest",
  "data/cards.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "logos/onepiece-logo.png",
  "logos/pokemon-logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== IMG_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Imagenes de cartas de Pokemon y Dragon Ball: vienen de CDNs oficiales
  // (cross-origin), asi que se cachean aparte del resto de los pedidos
  // same-origin de mas abajo.
  if (EXTERNAL_IMG_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((resp) => {
            cache.put(event.request, resp.clone());
            return resp;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/img/")) {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((resp) => {
            if (resp.ok) cache.put(event.request, resp.clone());
            return resp;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((resp) => {
        const copy = resp.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
