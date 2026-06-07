/* MacroDesk · Small Cap — Service Worker
 * Lot A : installable + hors-ligne.  Squelette push prêt pour le Lot B.
 * Stratégie :
 *   - pages HTML  -> network-first (toujours la dernière version, fallback cache hors-ligne)
 *   - data/*.json -> network-first (données fraîches, fallback dernier cache)
 *   - icônes/CSS/fonts -> cache-first (rapide)
 */
const VERSION = 'macrodesk-v2-2026-06-07';
const SHELL = 'shell-' + VERSION;
const RUNTIME = 'runtime-' + VERSION;

// App shell des 5 pages Small Cap (chemins relatifs au scope /macrodesks/)
const SHELL_ASSETS = [
  'smallcap.html',
  'decouvertes.html',
  'moniteur.html',
  'validateur.html',
  'smallcap_guide.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-192-maskable.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // addAll échoue en bloc si une ressource manque -> on tolère les absences
      Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isHTML(req) {
  return req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
}
function isData(url) {
  return url.pathname.includes('/data/') && url.pathname.endsWith('.json');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages HTML : réseau d'abord, cache en secours (hors-ligne)
  if (isHTML(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('smallcap.html')))
    );
    return;
  }

  // Données JSON : réseau d'abord, dernier cache en secours
  if (isData(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Icônes, CSS, polices (même origine ou CDN) : cache d'abord
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && (url.origin === location.origin || req.url.startsWith('https://cdn.') || req.url.includes('fonts.g'))) {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

/* ───────── Squelette notifications (activé au Lot B) ───────── */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'MacroDesk — alerte';
  const options = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag || 'macrodesk',
    data: { url: data.url || 'moniteur.html' },
    requireInteraction: data.urgent === true   // 🔴 SORTIR reste affiché
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || 'smallcap.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
