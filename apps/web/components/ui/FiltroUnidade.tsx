'use client'

import { useSession } from '@/contexts/SessionContext'

/**
 * Filtro de unidade para listagens. Ligado ao seletor global da sessão:
 * trocar aqui muda a unidade ativa do app inteiro (fonte única de verdade).
 * Só aparece para quem tem acesso a mais de uma unidade.
 */
export function FiltroUnidade({ className = '' }: { className?: string }) {
  const { unidades, unidadeAtiva, setUnidadeAtiva } = useSession()
  if (unidades.length <= 1) return null

  return (
    <select
      value={unidadeAtiva?.id ?? ''}
      onChange={e => {
        const u = unidades.find(x => x.id === e.target.value)
        if (u) setUnidadeAtiva(u)
      }}
      title="Unidade"
      className={`px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-200 ${className}`}
    >
      {unidades.map(u => (
        <option key={u.id} value={u.id}>{u.nome}</option>
      ))}
    </select>
  )
}
