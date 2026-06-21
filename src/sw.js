// FinVision Pro — Service Worker v8
// Compilado pelo vite-plugin-pwa (injectManifest)

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';

// ── Controle ──────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();

  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, url, tag } = event.data.payload;
    self.registration.showNotification(title || 'FinVision Pro', {
      body: body || '',
      icon: icon || '/logo.png',
      badge: '/badge.png',
      tag: tag || 'finvision',
      data: { url: url || '/' },
      vibrate: [200, 100, 200],
    });
  }

  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, icon, url, tag, delay } = event.data.payload;
    setTimeout(() => {
      self.registration.showNotification(title || 'FinVision Pro', {
        body: body || '',
        icon: icon || '/logo.png',
        badge: '/badge.png',
        tag: tag || 'finvision-scheduled',
        data: { url: url || '/' },
        vibrate: [200, 100, 200],
      });
    }, delay || 0);
  }
});

clientsClaim();
cleanupOutdatedCaches();

// ── Precache (assets gerados pelo Vite) ───────────────────────────────
precacheAndRoute(self.__WB_MANIFEST || []);

// ── Fetch handler (OBRIGATÓRIO para PWA instalável no Android) ────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora: não-GET, extensões, supabase (deixa o app lidar offline)
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('googleapis.com')) return;

  // Força network-first para version.json e changelog.json para permitir verificação de versão sem cache
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('changelog.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open('finvision-dynamic-v8').then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // SPA fallback: retorna index.html para navegação
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        return (await matchPrecache('/index.html')) || caches.match('/index.html');
      })
    );
    return;
  }

  // Cache-first para assets estáticos
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open('finvision-dynamic-v8').then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(async () => {
        if (event.request.destination === 'document') {
          return (await matchPrecache('/index.html')) || caches.match('/index.html');
        }
      });
    })
  );
});

// ── Push (Web Push API — futuro) ──────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = { title: 'FinVision Pro', body: 'Você tem novas atualizações!', url: '/' };
  if (event.data) {
    try { payload = { ...payload, ...event.data.json() }; }
    catch { payload.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/logo.png',
      badge: '/badge.png',
      data: { url: payload.url || '/' },
      vibrate: [200, 100, 200, 100, 200],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
