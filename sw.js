const CACHE = 'joh-rooms-v4';
const ASSETS = [
  './','./index.html','./manifest.webmanifest','./icon.png',
  './vendor/pdf.min.js','./vendor/pdf.worker.min.js',
  './plans/B2.pdf','./plans/B1.pdf','./plans/00.pdf','./plans/01.pdf','./plans/02.pdf',
  './plans/03.pdf','./plans/04.pdf','./plans/05.pdf','./plans/06.pdf',
  './png/B2.png','./png/B1.png','./png/00.png','./png/01.png','./png/02.png',
  './png/03.png','./png/04.png','./png/05.png','./png/06.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const isApp = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('sw.js');
  if (isApp) {
    e.respondWith(fetch(e.request).then(r => { const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r; })
      .catch(() => caches.match(e.request).then(h => h || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(h => h || fetch(e.request).then(r => {
      const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r;
    })));
  }
});
