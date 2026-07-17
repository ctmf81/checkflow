'use client'

import { useEffect, useState } from 'react'
import { Bell, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { pushSuportado, pushConfigurado, ehStandalone, permissaoAtual, estaInscrito, inscrever } from '@/lib/push'

const DISPENSADO_KEY = 'checkflow_push_optin_dispensado'

// Convite único (login) para ativar notificações push — só para quem está no
// PWA instalado, com push suportado/configurado e ainda sem decisão. Discreto,
// dispensável. O controle permanente fica nas Configurações (PushToggle).
export function PushOptIn() {
  const [mostrar, setMostrar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    async function avaliar() {
      if (!pushSuportado() || !pushConfigurado()) return
      if (!ehStandalone()) return                       // só no app instalado
      if (permissaoAtual() !== 'default') return         // já decidiu (granted/denied)
      if (localStorage.getItem(DISPENSADO_KEY)) return   // já dispensou
      if (await estaInscrito()) return
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return                                  // só logado
      if (vivo) setMostrar(true)
    }
    avaliar()
    return () => { vivo = false }
  }, [])

  if (!mostrar) return null

  function dispensar() {
    localStorage.setItem(DISPENSADO_KEY, '1')
    setMostrar(false)
  }

  async function ativar() {
    setOcupado(true); setErro('')
    const r = await inscrever()
    setOcupado(false)
    if (r.ok) { localStorage.setItem(DISPENSADO_KEY, '1'); setMostrar(false) }
    else setErro(r.motivo ?? 'Não foi possível ativar.')
  }

  return (
    <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
          <Bell size={18} className="text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Ativar notificações?</p>
          <p className="text-xs text-gray-500 mt-0.5">Receba alertas de tickets, planos de ação e tarefas neste aparelho.</p>
          {erro && <p className="text-xs text-red-500 mt-1.5">{erro}</p>}
          <div className="flex items-center gap-2 mt-3">
            <button onClick={ativar} disabled={ocupado}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
              {ocupado && <Loader2 size={13} className="animate-spin" />}Ativar
            </button>
            <button onClick={dispensar} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Agora não</button>
          </div>
        </div>
        <button onClick={dispensar} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={16} /></button>
      </div>
    </div>
  )
}
