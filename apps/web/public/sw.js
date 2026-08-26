/**
 * FORM service worker.
 *
 * Offline is the default, not a feature: gyms are concrete boxes with no
 * signal, and a workout app that needs the network is a workout app that fails
 * exactly when it is being used.
 *
 * Written by hand rather than generated -- the caching this app needs is small
 * and specific, and an opaque generated worker is hard to reason about when
 * someone is standing in a gym looking at a blank screen.
 */
// Bumped whenever the caching strategy changes, so stale entries are dropped
// on activate rather than served forever.
const VERSION = "form-v2";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const IMAGES = `${VERSION}-images`;

const SHELL_URLS = [
  "/",
  "/plans",
  "/plans/new",
  "/progress",
  "/you",
  "/setups",
  "/setups/new",
  "/onboarding",
  "/manifest.webmanifest",
];

/**
 * Pulls the exercise library into the cache during install.
 *
 * It is a separate chunk loaded on demand, so without this a fresh install that
 * went offline before opening a plan had no library at all -- and the app has
 * nothing to show without one. "Offline is the default, not a feature"
 * (ENGINEERING.md §1) has to include the first run.
 *
 * The chunk is content-hashed, so its URL is discovered from the build manifest
 * rather than hard-coded.
 */
async function precacheLibrary(cache) {
  try {
    const response = await fetch("/", { cache: "no-store" });
    if (!response.ok) return;
    const html = await response.text();
    const urls = new Set();
    for (const match of html.matchAll(/["'`](\/_next\/static\/[^"'`\s]+?\.js)["'`]/g)) {
      if (match[1]) urls.add(match[1]);
    }
    await Promise.allSettled([...urls].map((url) => cache.add(url)));
  } catch {
    // Precaching is an optimisation; a failed install would be worse.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      // One bad URL must not fail the whole install, so cache individually.
      await Promise.allSettled(SHELL_URLS.map((url) => shell.add(url)));
      await precacheLibrary(await caches.open(ASSETS));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached ?? (await network) ?? Response.error();
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") void cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Exercise photos come from a CDN and never change; cache them hard so the
  // demo panel still renders with no signal.
  if (url.hostname === "raw.githubusercontent.com") {
    event.respondWith(cacheFirst(request, IMAGES));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navigations: serve the network when it is there, the cached shell when it
  // is not, so opening the app in a basement still works.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(SHELL).then((c) => c.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match("/")) ?? Response.error())
    );
    return;
  }

  // Build output is content-hashed, and the exercise library is a large static
  // JSON: both are safe to serve from cache first and refresh in the background.
  event.respondWith(staleWhileRevalidate(request, ASSETS));
});
