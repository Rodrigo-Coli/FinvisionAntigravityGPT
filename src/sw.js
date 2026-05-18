import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// ── Core ──────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Schedule a local notification from the main thread
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, icon, url, tag, delay } = event.data.payload;
    setTimeout(() => {
      self.registration.showNotification(title || 'FinVision Pro', {
        body: body || '',
        icon: icon || '/logo.png',
        badge: '/logo.png',
        tag: tag || 'finvision-alert',
        data: { url: url || '/' },
        vibrate: [200, 100, 200],
        requireInteraction: false
      });
    }, delay || 0);
  }

  // Send a local notification immediately
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, url, tag } = event.data.payload;
    self.registration.showNotification(title || 'FinVision Pro', {
      body: body || '',
      icon: icon || '/logo.png',
      badge: '/logo.png',
      tag: tag || 'finvision-alert',
      data: { url: url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: false
    });
  }
});

clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// ── Push (Web Push API — servidor externo) ────────────────────────────
self.addEventListener('push', (event) => {
  let payload = { title: 'FinVision Pro', body: 'Você tem novas atualizações!', url: '/' };
  if (event.data) {
    try { payload = { ...payload, ...event.data.json() }; }
    catch { payload.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/logo.png',
      badge: '/logo.png',
      data: { url: payload.url || '/' },
      vibrate: [200, 100, 200, 100, 200]
    })
  );
});

// ── Notification click ────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
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

// ── Periodic background sync (check bills) ──────────────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-bills') {
    event.waitUntil(checkUpcomingBills());
  }
});

async function checkUpcomingBills() {
  // Notifica clientes para verificar vencimentos
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'CHECK_BILLS_DUE' }));
}
