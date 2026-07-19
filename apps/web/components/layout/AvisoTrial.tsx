'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { ehAdminDaEmpresa } from '@/lib/admin'

// Banner na Home: aparece só nos últimos 5 dias do teste. Depois do trial a
// conta fica em somente-leitura (não cria itens novos). Ver /biz.
// Contratar é ação do admin → o botão "Ver planos" só aparece para admin da
// empresa/sistema; os demais veem orientação para falar com o administrador.
export function AvisoTrial() {
  const { empresaAtiva } = useSession()
  const router = useRouter()
  const [dias, setDias] = useState<number | null>(null)
  const [ehAdmin, setEhAdmin] = useState(false)

  useEffect(() => {
    if (!empresaAtiva?.id) { setDias(null); setEhAdmin(false); return }
    let cancel = false
    const sb = createClient()
    sb.rpc('empresa_dias_trial', { p_empresa_id: empresaAtiva.id })
      .then(({ data }) => { if (!cancel) setDias(typeof data === 'number' ? data : null) })
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const admin = user.app_metadata?.role === 'admin_sistema' || await ehAdminDaEmpresa(sb, empresaAtiva.id)
      if (!cancel) setEhAdmin(admin)
    })()
    return () => { cancel = true }
  }, [empresaAtiva?.id])

  if (dias === null || dias > 5) return null

  const quando = dias <= 0 ? 'termina hoje' : dias === 1 ? 'termina amanhã' : `termina em ${dias} dias`

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
      <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800">Seu teste {quando}</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Ao terminar, a conta fica em <span className="font-medium">somente-leitura</span>: você continua consultando e operando, mas não cria novos itens (checklists, tarefas, tickets…). Contrate um plano para não perder recursos.
          {!ehAdmin && <span className="block mt-1">Em caso de dúvida, fale com o <span className="font-medium">administrador da empresa</span>.</span>}
        </p>
      </div>
      {ehAdmin && (
        <button
          onClick={() => router.push('/gestao/plano')}
          className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors flex-shrink-0">
          Ver planos <ArrowRight size={15} />
        </button>
      )}
    </div>
  )
}
