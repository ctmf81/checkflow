// Service Worker do CheckFlow PWA.
// Estratégia conservadora para não servir dados desatualizados:
//  - Só intercepta GET de mesma origem.
//  - Estáticos (_next/static, ícones, fontes) → cache-first.
//  - Navegação (HTML) → network-first com fallback para cache (carrega offline).
//  - Tudo que for API/Supabase/cross-origin passa direto pela rede (sem cache).
const CACHE = 'checkflow-v2'
const APP_SHELL = ['/operacao', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname === '/apple-touch-icon.png' ||
    /\.(png|jpg|jpeg|svg|webp|woff2?|ttf|css|js)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase, APIs externas: rede direta
  if (url.pathname.startsWith('/api/')) return

  // Estáticos: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
            return res
          })
      )
    )
    return
  }

  // Navegação / HTML: offline é EXCLUSIVO da área de operação. Gestão, sistema,
  // login etc. passam direto pela rede — sem cache e sem fallback offline.
  if (request.mode === 'navigate') {
    if (!url.pathname.startsWith('/operacao')) return // rede normal, sem offline
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/operacao')))
    )
  }
})
