// Stackup CRM as an installable app. Keeps the CRM's own files so it opens fast and
// shows the login screen even with a weak connection. Never touches the Apps Script
// backend: applications, tokens and files always go straight to the network.
const CACHE = 'stackup-crm-v1';
const SHELL = ['/admin.html', '/admin.css', '/brief.css', '/admin.js', '/config.js', '/assets/icons/crm-192.png?v=2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('stackup-crm-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  // network first (always the latest version), cache only as a fallback when offline
  e.respondWith(fetch(r).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('/admin.html'))));
});
