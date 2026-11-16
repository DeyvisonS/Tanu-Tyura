const CACHE_NAME = "tanu-tyura-shell-v3";
const APP_ROOT = new URL("./", self.registration.scope).toString();
const PUBLIC_ASSET_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

const isCacheableUrl = (url) =>
  url.origin === self.location.origin || PUBLIC_ASSET_HOSTS.has(url.hostname);

const isCacheableResponse = (response) => response.ok || response.type === "opaque";

const cacheApplicationShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(APP_ROOT, { cache: "reload" });
  if (!response.ok) throw new Error("Não foi possível obter o shell da aplicação.");

  await cache.put(APP_ROOT, response.clone());
  const html = await response.text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], APP_ROOT))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.toString());

  await Promise.all(assetUrls.map(async (url) => {
    const assetResponse = await fetch(url, { cache: "reload" });
    if (assetResponse.ok) await cache.put(url, assetResponse);
  }));
};

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith("tanu-tyura-shell-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_APP_RESOURCES" || !Array.isArray(event.data.urls)) return;

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      event.data.urls.map(async (value) => {
        const url = new URL(value, APP_ROOT);
        if (!isCacheableUrl(url)) return;
        const response = await fetch(url, { cache: "reload" });
        if (isCacheableResponse(response)) await cache.put(url.toString(), response);
      }),
    )),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || !isCacheableUrl(url)) return;
  if (url.origin !== self.location.origin && request.destination !== "font" && request.destination !== "style") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(APP_ROOT, response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match(APP_ROOT)) || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then(async (response) => {
        if (isCacheableResponse(response)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      });
    }),
  );
});
