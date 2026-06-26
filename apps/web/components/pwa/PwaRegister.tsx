'use client'

import { useEffect } from 'react'
import { initPwaInstall } from '@/lib/pwaInstall'

// Registra o service worker do PWA. Renderizado uma vez no layout raiz.
// Sem UI — apenas habilita instalação e carregamento offline.
export function PwaRegister() {
  useEffect(() => {
    initPwaInstall() // captura o evento beforeinstallprompt o quanto antes

    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV === 'development') return // evita cache atrapalhar o dev

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((err) => console.error('Falha ao registrar service worker:', err))
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register)

    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
