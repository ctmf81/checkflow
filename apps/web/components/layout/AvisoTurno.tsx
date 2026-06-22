'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'

// Banner dispensável para usuários cujo turno está no modo 'aviso' e que
// estão fora do horário agora. Não bloqueia nada — só sinaliza. A decisão
// (modo + dentro/fora do turno) vem do Postgres via usuario_deve_avisar_turno.
// Dispensa fica na sessão (sessionStorage) para não reaparecer a cada navegação.
const DISMISS_KEY = 'checkflow_aviso_turno_dispensado'

export function AvisoTurno() {
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY)) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.rpc('usuario_deve_avisar_turno', { p_usuario_id: user.id }).then(({ data }) => {
        if (data === true) setMostrar(true)
      })
    })
  }, [])

  if (!mostrar) return null

  function dispensar() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setMostrar(false)
  }

  return (
    <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-700">
      <AlertTriangle size={15} className="flex-shrink-0" />
      <span className="flex-1">Você está fora do seu horário de turno.</span>
      <button onClick={dispensar} className="p-1 text-amber-500 hover:text-amber-700 rounded">
        <X size={15} />
      </button>
    </div>
  )
}
