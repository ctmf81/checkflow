'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { ONBOARDING_PLANOS_ACAO } from '@/components/onboarding/configs'
import { visivelPorSubgrupo } from '@/lib/visibilidade'
import { ehAdminDaEmpresa } from '@/lib/admin'
import { useSession } from '@/contexts/SessionContext'
import { usePolling } from '@/lib/usePolling'
import {
  ClipboardList, Clock, CheckCircle2, XCircle,
  ChevronRight, Loader2, RefreshCw, X
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusPlano = 'em_moderacao_n1' | 'em_moderacao_n2' | 'corrigido' | 'nao_corrigido'

interface PlanoItem {
  id: string
  status: StatusPlano
  subgrupo_id: string
  criado_por: string
  identificador: string | null
  observacao_abertura: string | null
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

type Filtro = 'abertos' | 'n1' | 'n2' | 'corrigido' | 'nao_corrigido' | 'todos'

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: 'abertos',       label: 'Abertos' },
  { valor: 'corrigido',     label: 'Corrigidos' },
  { valor: 'nao_corrigido', label: 'Não corrigidos' },
  { valor: 'todos',         label: 'Todos' },
]

function statusDeFiltro(f: Filtro): StatusPlano[] {
  if (f === 'abertos')       return ['em_moderacao_n1', 'em_moderacao_n2']
  if (f === 'n1')            return ['em_moderacao_n1']
  if (f === 'n2')            return ['em_moderacao_n2']
  if (f === 'corrigido')     return ['corrigido']
  if (f === 'nao_corrigido') return ['nao_corrigido']
  return ['em_moderacao_n1', 'em_moderacao_n2', 'corrigido', 'nao_corrigido']
}

const FILTROS_VALIDOS: Filtro[] = ['abertos', 'n1', 'n2', 'corrigido', 'nao_corrigido', 'todos']

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
  return (
    <Suspense fallback={null}>
      <PlanosAcaoContent />
    </Suspense>
  )
}

function PlanosAcaoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { empresaAtiva, unidadeAtiva } = useSession()
  const execId = searchParams.get('exec')
  const filtroUrl = searchParams.get('filtro') as Filtro | null
  const [filtro, setFiltro] = useState<Filtro>(
    filtroUrl && FILTROS_VALIDOS.includes(filtroUrl) ? filtroUrl : 'abertos'
  )
  const [planos, setPlanos] = useState<PlanoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [nomeChecklist, setNomeChecklist] = useState<string | null>(null)

  async function carregar(f: Filtro) {
    setLoading(true)
    const sb = createClient()

    let query = sb
      .from('planos_acao')
      .select(`
        id, status, subgrupo_id, criado_por, identificador, observacao_abertura, created_at,
        subgrupos(nome),
        checklist_atividades(nome),
        checklist_execucoes(checklists(nome)),
        usuarios!criado_por(nome)
      `)
      // Ordena pela última movimentação (updated_at é bumpado por trigger a cada
      // ação no plano) — mais recente primeiro.
      .order('updated_at', { ascending: false })

    if (execId) {
      query = query.eq('checklist_execucao_id', execId)
    } else {
      // Escopa pela unidade ativa (cada tela mostra só a unidade selecionada)
      if (unidadeAtiva?.id) query = query.eq('unidade_id', unidadeAtiva.id)
      query = query.in('status', statusDeFiltro(f))
    }

    const { data } = await query

    // Visibilidade: só vê o plano quem o ABRIU ou quem PERTENCE ao grupo/subgrupo
    // de resolução (subgrupo do checklist que originou o plano). Admin vê todos.
    const { data: { user } } = await sb.auth.getUser()
    const isAdmin = await ehAdminDaEmpresa(sb, empresaAtiva?.id)
    let meusSubgrupos = new Set<string>()
    if (user && !isAdmin) {
      const { data: us } = await sb.from('usuario_subgrupo').select('subgrupo_id').eq('usuario_id', user.id)
      meusSubgrupos = new Set((us ?? []).map((r: any) => r.subgrupo_id))
    }

    const lista = ((data ?? []) as unknown as PlanoItem[])
      .filter(p => visivelPorSubgrupo(p.subgrupo_id, { isAdmin, meusSubgrupos }) || p.criado_por === user?.id)
    setPlanos(lista)
    setNomeChecklist(execId ? (lista[0]?.checklist_execucoes?.checklists?.nome ?? null) : null)
    setLoading(false)
  }

  useEffect(() => { carregar(filtro) }, [filtro, execId, empresaAtiva?.id, unidadeAtiva?.id])
  usePolling(() => carregar(filtro), 45000, !!unidadeAtiva?.id)

  return (
    <div className="max-w-4xl mx-auto">
      <Onboarding pageId="planos-acao" titulo="Planos de Ação" cards={ONBOARDING_PLANOS_ACAO} />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Planos de Ação</h1>
          <p className="hidden sm:block text-sm text-gray-400 mt-0.5">Acompanhe e modere os planos abertos na sua área</p>
        </div>
        <button onClick={() => carregar(filtro)}
          className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filtro por execução (vindo do histórico de checklists) */}
      {execId && (
        <div className="flex items-center justify-between gap-3 mb-5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
          <p className="text-sm text-orange-700">
            Mostrando planos de ação da execução{nomeChecklist ? <> de <span className="font-semibold">{nomeChecklist}</span></> : ''}
          </p>
          <button onClick={() => router.push('/gestao/planos-acao')}
            className="flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-800 transition-colors">
            <X size={13} />Limpar filtro
          </button>
        </div>
      )}

      {/* Filtros (ordenados pela última movimentação, mais recente primeiro) */}
      {!execId && (
        <div className="flex gap-1.5 mb-5 bg-gray-100 p-1 rounded-xl w-fit max-w-full overflow-x-auto">
          {FILTROS.map(f => (
            <button key={f.valor} onClick={() => setFiltro(f.valor)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                filtro === f.valor
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : planos.length === 0 ? (
        <div className="py-20 text-center">
          <ClipboardList size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            {execId ? 'Nenhum plano de ação para esta execução.' : filtro === 'abertos' ? 'Nenhum plano de ação em aberto.' : 'Nenhum plano encontrado.'}
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
