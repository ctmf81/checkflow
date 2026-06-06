'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  ClipboardList, Clock, CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, Loader2, RefreshCw
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusPlano = 'em_moderacao_n1' | 'em_moderacao_n2' | 'corrigido' | 'nao_corrigido'

interface PlanoItem {
  id: string
  status: StatusPlano
  identificador: string | null
  observacao_abertura: string | null
  sla_prazo: string | null
  created_at: string
  subgrupos: { nome: string } | null
  checklist_atividades: { nome: string } | null
  checklist_execucoes: { checklists: { nome: string } | null } | null
  usuarios: { nome: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusPlano, { label: string; cor: string; Icon: any }> = {
  em_moderacao_n1: { label: 'Moderação N1', cor: 'bg-amber-100 text-amber-700',   Icon: Clock },
  em_moderacao_n2: { label: 'Moderação N2', cor: 'bg-orange-100 text-orange-700', Icon: Clock },
  corrigido:       { label: 'Corrigido',    cor: 'bg-green-100 text-green-700',   Icon: CheckCircle2 },
  nao_corrigido:   { label: 'Não corrigido',cor: 'bg-red-100 text-red-700',       Icon: XCircle },
}

type Filtro = 'abertos' | 'corrigido' | 'nao_corrigido' | 'todos'

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: 'abertos',       label: 'Abertos' },
  { valor: 'corrigido',     label: 'Corrigidos' },
  { valor: 'nao_corrigido', label: 'Não corrigidos' },
  { valor: 'todos',         label: 'Todos' },
]

function statusDeFiltro(f: Filtro): StatusPlano[] {
  if (f === 'abertos')       return ['em_moderacao_n1', 'em_moderacao_n2']
  if (f === 'corrigido')     return ['corrigido']
  if (f === 'nao_corrigido') return ['nao_corrigido']
  return ['em_moderacao_n1', 'em_moderacao_n2', 'corrigido', 'nao_corrigido']
}

function SlaTag({ prazo }: { prazo: string | null }) {
  if (!prazo) return null
  const diff = new Date(prazo).getTime() - Date.now()
  const horas = Math.round(diff / 3600000)
  if (horas > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
        <Clock size={11} />SLA: {horas}h restantes
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
      <AlertTriangle size={11} />SLA vencido ({Math.abs(horas)}h atrás)
    </span>
  )
}

function DataRelativa({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 60)  return <>{min}min atrás</>
  const h = Math.floor(diff / 3600000)
  if (h < 24)   return <>{h}h atrás</>
  const d = Math.floor(diff / 86400000)
  return <>{d}d atrás</>
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PlanosAcaoPage() {
  const router = useRouter()
  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [planos, setPlanos] = useState<PlanoItem[]>([])
  const [loading, setLoading] = useState(true)

  async function carregar(f: Filtro) {
    setLoading(true)
    const sb = createClient()
    const statuses = statusDeFiltro(f)

    const { data } = await sb
      .from('planos_acao')
      .select(`
        id, status, identificador, observacao_abertura, sla_prazo, created_at,
        subgrupos(nome),
        checklist_atividades(nome),
        checklist_execucoes(checklists(nome)),
        usuarios!criado_por(nome)
      `)
      .in('status', statuses)
      .order('created_at', { ascending: false })

    setPlanos((data ?? []) as unknown as PlanoItem[])
    setLoading(false)
  }

  useEffect(() => { carregar(filtro) }, [filtro])

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Planos de Ação</h1>
          <p className="text-sm text-gray-400 mt-0.5">Acompanhe e modere os planos abertos na sua área</p>
        </div>
        <button onClick={() => carregar(filtro)}
          className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-1.5 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {FILTROS.map(f => (
          <button key={f.valor} onClick={() => setFiltro(f.valor)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              filtro === f.valor
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : planos.length === 0 ? (
        <div className="py-20 text-center">
          <ClipboardList size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            {filtro === 'abertos' ? 'Nenhum plano de ação em aberto.' : 'Nenhum plano encontrado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {planos.map(p => {
            const cfg = STATUS_CONFIG[p.status]
            const checklist = (p.checklist_execucoes as any)?.checklists?.nome ?? '—'
            return (
              <button key={p.id} onClick={() => router.push(`/gestao/planos-acao/${p.id}`)}
                className="w-full bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm hover:border-gray-300 transition-all text-left group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Status + subgrupo + identificador */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cor}`}>
                        <cfg.Icon size={11} />
                        {cfg.label}
                      </span>
                      {p.subgrupos?.nome && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {p.subgrupos.nome}
                        </span>
                      )}
                      {p.identificador && (
                        <span className="text-xs font-mono font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full tracking-wide">
                          {p.identificador}
                        </span>
                      )}
                    </div>

                    {/* Atividade */}
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {p.checklist_atividades?.nome ?? '—'}
                    </p>

                    {/* Checklist */}
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      Checklist: {checklist}
                    </p>

                    {/* Observação prévia */}
                    {p.observacao_abertura && (
                      <p className="text-xs text-gray-500 mt-1.5 line-clamp-1 italic">
                        "{p.observacao_abertura}"
                      </p>
                    )}

                    {/* Metadados */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-xs text-gray-400">
                        Aberto por <span className="font-medium text-gray-600">{p.usuarios?.nome ?? '—'}</span>
                        {' · '}<DataRelativa iso={p.created_at} />
                      </span>
                      <SlaTag prazo={p.sla_prazo} />
                    </div>
                  </div>

                  <ChevronRight size={16} className="text-gray-300 group-hover:text-orange-400 flex-shrink-0 mt-1 transition-colors" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
