import type { MetadataRoute } from 'next'

// Manifest do PWA — torna o CheckFlow instalável na tela inicial ("Adicionar
// à tela inicial" no Android/iOS). Substitui a antiga distribuição via APK/Expo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CheckFlow',
    short_name: 'CheckFlow',
    description: 'Plataforma de checklists com verificação em tempo real',
    start_url: '/operacao',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#f97316',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
