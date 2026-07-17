// Service Worker do CheckFlow PWA.
// Estratégia conservadora para não servir dados desatualizados:
//  - Só intercepta GET de mesma origem.
//  - Estáticos (_next/static, ícones, fontes) → cache-first.
//  - Navegação (HTML) → network-first com fallback para cache (carrega offline).
//  - Tudo que for API/Supabase/cross-origin passa direto pela rede (sem cache).
const CACHE = 'checkflow-v3'
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

// ─── Web Push ────────────────────────────────────────────────────────────────
// Recebe a notificação enviada pela API (payload JSON: { title, body, url }).
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = {} }
  const title = data.title || 'CheckFlow'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined, // agrupa notificações do mesmo assunto quando informado
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Clique na notificação: foca uma aba já aberta no link ou abre uma nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const alvo = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          const u = new URL(client.url)
          if (u.pathname === alvo || client.url.includes(alvo)) return client.focus()
        } catch (e) { /* noop */ }
      }
      return self.clients.openWindow(alvo)
    })
  )
})
