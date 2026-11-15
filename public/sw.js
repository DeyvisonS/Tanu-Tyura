/* Tanu-Tyura — cache do aplicativo para acesso offline. */
const CACHE_PREFIX = "tanu-tyura";
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v1`;
const ASSET_CACHE = `${CACHE_PREFIX}-assets-v1`;
const APP_SCOPE = new URL(self.registration.scope);
const APP_SHELL_URL = new URL("./", self.registration.scope).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.add(APP_SHELL_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, ASSET_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (!requestUrl.pathname.startsWith(APP_SCOPE.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => cache.put(APP_SHELL_URL, copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedShell = await caches.match(APP_SHELL_URL);
          return cachedShell || new Response("Tanu-Tyura está indisponível neste dispositivo. Conecte-se à internet para abrir a plataforma pela primeira vez.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
    );
    return;
  }

  const cacheableDestinations = ["script", "style", "image", "font"];
  if (!cacheableDestinations.includes(request.destination)) return;

  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        const cachedResponse = await cache.match(request);
        return cachedResponse || new Response("Recurso indisponível offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })
  );
});
