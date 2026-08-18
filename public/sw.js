const SHELL_CACHE = "commute-bus-shell-v1";
const REQUIRED_SHELL = ["/manifest.webmanifest", "/pwa-icon.svg", "/register-sw.js"];

const appAssetsFrom = async (response) => {
  const html = await response.clone().text();
  const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(([, path]) => path);
  return paths.filter((path) => path?.startsWith("/"));
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const rootResponse = await fetch("/", { cache: "reload" });
      if (!rootResponse.ok) {
        throw new Error(`App shell request failed with ${rootResponse.status}`);
      }
      const discoveredAssets = await appAssetsFrom(rootResponse);
      const shellAssets = [...new Set([...REQUIRED_SHELL, ...discoveredAssets])];

      await cache.put("/", rootResponse);
      await cache.addAll(shellAssets);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== SHELL_CACHE)
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put("/", response.clone());
          }
          return response;
        })
        .catch(async (error) => {
          const cachedShell = await caches.match("/");
          if (cachedShell) {
            return cachedShell;
          }
          throw error;
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
