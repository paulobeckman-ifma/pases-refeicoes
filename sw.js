// Service worker: permite abrir o balcão mesmo sem internet (arquivos do sistema ficam guardados no computador).
const CACHE = 'pases-v1.3';
const ESSENCIAIS = [
  './', 'index.html', 'tela-aluno.html', 'config.js', 'css/app.css',
  'js/app.js', 'js/util.js', 'js/api.js', 'js/camera.js', 'js/face.js', 'js/kiosk.js', 'js/tela-aluno.js',
  'assets/logo-ifma.png', 'assets/simbolo-ifma.png', 'vendor/face-api/face-api.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // API e Apps Script: sempre rede
  if (url.pathname.includes('/vendor/')) {
    // modelos do reconhecimento facial: grandes e fixos, cache primeiro
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return resp;
    })));
    return;
  }
  // demais arquivos: rede primeiro (recebe atualizações), cache se estiver sem internet
  e.respondWith(fetch(e.request).then((resp) => {
    const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return resp;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
