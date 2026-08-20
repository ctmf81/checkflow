'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
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

  // Carência (para todos): banner amarelo permanente. A UI de tela cheia
  // ('bloqueio_total') foi removida quando o SQL deixou de retornar a fase
  // 'bloqueada' (2026-07-22, migration 20260722120000) — hoje a somente-leitura
  // é vivida como banner + criação bloqueada nas telas.
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 text-sm bg-amber-50 text-amber-800 border-b border-amber-100">
      <AlertTriangle size={15} className="shrink-0" />
      <span className="min-w-0">
        Seu período de teste terminou — o sistema está em modo somente-leitura:
        não é possível criar checklists, tarefas, tickets, agendamentos ou
        workflows. Contrate um plano para reativar a criação.{' '}
        {isAdmin && (
          <a href="/gestao/plano" className="font-medium underline underline-offset-2">Ver plano</a>
        )}
      </span>
    </div>
  )
}
