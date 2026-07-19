'use client'

import { useEffect, useState } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { ehAdminDaEmpresa } from '@/lib/admin'
import { estadoAssinaturaGate } from '@/lib/entitlements/assinaturaFase'

/**
 * Gate do ciclo de vida da assinatura (uso livre → carência → bloqueio).
 * - bloqueada + usuário comum → tela cheia de bloqueio (admin da empresa/sistema
 *   mantêm acesso para regularizar).
 * - carência (ou bloqueada para admin) → banner de aviso no topo.
 * Fase vem de `empresa_fase_assinatura` (RPC). Empresa sem assinatura/plano pago
 * = 'ativa' (nada aparece).
 */
export function AssinaturaGate() {
  const { empresaAtiva, faseAssinatura: fase } = useSession()
  const [isAdmin, setIsAdmin] = useState(false) // admin da empresa OU de sistema
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    if (!empresaAtiva?.id) { setPronto(false); return }
    let cancel = false
    const sb = createClient()
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      const adminSis = user?.app_metadata?.role === 'admin_sistema'
      const adminEmp = adminSis ? true : (user ? await ehAdminDaEmpresa(sb, empresaAtiva.id) : false)
      if (cancel) return
      setIsAdmin(adminSis || adminEmp)
      setPronto(true)
    })()
    return () => { cancel = true }
  }, [empresaAtiva?.id])

  const estado = estadoAssinaturaGate(fase, isAdmin, pronto)
  if (estado.tipo === 'nada') return null

  // Bloqueio total: usuário comum não acessa (admin passa e vê só o banner).
  if (estado.tipo === 'bloqueio_total') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/95 p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
            <Lock size={30} className="text-slate-300" />
          </div>
          <h1 className="text-lg font-semibold text-white">Sistema bloqueado</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            O sistema se encontra bloqueado, procure o administrador do sistema da sua
            empresa para mais informações.
          </p>
        </div>
      </div>
    )
  }

  // Carência (todos) ou bloqueada para admin → banner no topo.
  const bloqueada = estado.bloqueada
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 text-sm ${bloqueada ? 'bg-red-50 text-red-700 border-b border-red-100' : 'bg-amber-50 text-amber-800 border-b border-amber-100'}`}>
      <AlertTriangle size={15} className="shrink-0" />
      <span className="min-w-0">
        {bloqueada
          ? 'Acesso da empresa bloqueado — o período gratuito e a carência terminaram. '
          : 'Seu período de teste terminou — o sistema está em modo somente-leitura: não é possível criar checklists, tarefas, tickets, agendamentos ou workflows. Contrate um plano para reativar a criação. '}
        {isAdmin && (
          <a href="/gestao/plano" className="font-medium underline underline-offset-2">Ver plano</a>
        )}
      </span>
    </div>
  )
}
