'use client'

import { useEffect, useState } from 'react'
import { CloudUpload, Loader2 } from 'lucide-react'
import { processarFila, contarPendentes } from '@/lib/syncQueue'

// Mostra quantas execuções offline aguardam envio e as sincroniza quando há
// conexão (ao carregar, ao voltar a internet, e periodicamente). Renderizado
// no layout da operação.
export function PendingSync() {
  const [pendentes, setPendentes] = useState(0)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let cancelado = false

    async function sync() {
      const n = await contarPendentes()
      if (cancelado) return
      setPendentes(n)
      if (n > 0 && navigator.onLine && !enviando) {
        setEnviando(true)
        const res = await processarFila()
        if (cancelado) return
        setPendentes(res.restantes)
        setEnviando(false)
      }
    }

    sync()
    const onOnline = () => sync()
    window.addEventListener('online', onOnline)
    const iv = setInterval(sync, 30000) // rede pode voltar sem disparar 'online'
    return () => {
      cancelado = true
      window.removeEventListener('online', onOnline)
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (pendentes === 0 && !enviando) return null

  return (
    <div className="px-4 sm:px-6 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
      {enviando
        ? <Loader2 size={13} className="text-blue-500 animate-spin flex-shrink-0" />
        : <CloudUpload size={13} className="text-blue-500 flex-shrink-0" />}
      <p className="text-xs text-blue-700 font-medium">
        {enviando ? 'Enviando execuções salvas…' : `${pendentes} execução(ões) aguardando envio`}
      </p>
    </div>
  )
}
