// FinVision Pro — Service Worker (offline-first cache)
const CACHE_NAME = 'finvision-v6';
const STATIC_ASSETS = [
    '/',
    '/index.html',
];

// Install: cache static shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(names =>
            Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for static assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET and chrome-extension requests
    if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

    // Supabase API — network-first, fallback to nothing (offline handled by app)
    if (url.hostname.includes('supabase.co')) {
        event.respondWith(fetch(event.request).catch(() => new Response(
            JSON.stringify({ data: null, error: { message: 'Offline' } }),
            { headers: { 'Content-Type': 'application/json' } }
        )));
        return;
    }

    // Static assets — cache-first
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match('/index.html')); // SPA fallback
        })
    );
});

// Push Notifications
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'FinVision Pro', body: 'Nova atualização disponível!' };
    
    const options = {
        body: data.body,
        icon: '/logo.png',
        badge: '/logo.svg',
        data: data.url || '/',
        vibrate: [100, 50, 100],
        actions: [
            { action: 'open', title: 'Ver Detalhes' },
            { action: 'close', title: 'Fechar' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') return;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            const url = event.notification.data || '/';
            for (const client of clientList) {
                if (client.url === url && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
