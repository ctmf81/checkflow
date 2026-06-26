'use client'

import { useEffect, useState } from 'react'

// Hook simples de status de conexão. Reage aos eventos online/offline do
// navegador. Usado para avisar o operador e ativar o salvamento local.
export function useOnlineStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
