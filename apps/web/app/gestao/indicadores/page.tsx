'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useSession } from '@/contexts/SessionContext'
import { STATUS_NAO_ACEITO, STATUS_EM_TRATAMENTO, STATUS_FECHADOS } from '@/lib/tickets'
import {
  BarChart2, ArrowLeft, Loader2, RefreshCw,
  TrendingDown, Zap, Trophy, Ticket, ClipboardList, ListChecks,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Periodo = '24h' | '15d' | '30d'

interface TopChecklist {
  checklist_id: string
  checklist_nome: string
  total: number
  reprovados: number
  taxa: number
}

interface TopAtividade {
  atividade_id: string
  atividade_nome: string
  checklist_nome: string
  nao_conformes: number
  total_respostas: number
  taxa: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIODOS: { valor: Periodo; label: string }[] = [
  { valor: '24h', label: 'Últimas 24h' },
  { valor: '15d', label: 'Últimos 15d' },
  { valor: '30d', label: 'Últimos 30d' },
]

function periodoParaISO(p: Periodo): string {
  const mapa: Record<Periodo, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '15d': 15 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  }
  return new Date(Date.now() - mapa[p]).toISOString()
}

function BarHorizontal({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full transition-all ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function TaxaBadge({ taxa }: { taxa: number }) {
  const cor = taxa >= 80 ? 'text-green-600 bg-green-50' : taxa >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cor}`}>{taxa}%</span>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function IndicadoresPage() {
  const router = useRouter()
  const { unidadeAtiva } = useSession()
  const [periodo, setPeriodo] = useState<Periodo>('24h')

  // Indicadores são da UNIDADE ATIVA (visão de unidade; visão de empresa virá depois).
  const unidadeId = unidadeAtiva?.id ?? null

  const [topChecklists, setTopChecklists] = useState<TopChecklist[]>([])
  const [topAtividades, setTopAtividades] = useState<TopAtividade[]>([])

  const [loadingChecklists, setLoadingChecklists] = useState(true)
  const [loadingAtividades, setLoadingAtividades] = useState(true)

  // Tickets / Planos / Tarefas (resumo da unidade ativa no período)
  const [tickets, setTickets] = useState({ naoAceitos: 0, emTratamento: 0, finalizados: 0, criticos: 0, topCategorias: [] as { nome: string; total: number }[] })
  const [planos, setPlanos]   = useState({ emModeracao: 0, corrigidos: 0, naoCorrigidos: 0, aguardN1: 0, aguardN2: 0 })
  const [tarefas, setTarefas] = useState({ listasAtivas: 0, respostas: 0, pctConcluido: 0 })
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingPlanos,  setLoadingPlanos]  = useState(true)
  const [loadingTarefas, setLoadingTarefas] = useState(true)

  // ── Top 5 checklists com maior reincidência de reprovação ─────────────────
  const carregarTopChecklists = useCallback(async () => {
    if (!unidadeId) return
    setLoadingChecklists(true)
    const sb   = createClient()
    const from = periodoParaISO(periodo)

    const q = sb.from('checklist_execucoes')
      .select('checklist_id, resultado, checklists(nome)')
      .eq('status', 'concluido')
      .eq('unidade_id', unidadeId)
      .gte('data_execucao', from)

    const { data } = await q
    const rows = data ?? []

    // Agrega por checklist
    const mapa: Record<string, { nome: string; total: number; reprovados: number }> = {}
    for (const r of rows) {
      const id   = r.checklist_id
      const nome = (r.checklists as any)?.nome ?? '—'
      if (!mapa[id]) mapa[id] = { nome, total: 0, reprovados: 0 }
      mapa[id].total++
      if (r.resultado === 'reprovado') mapa[id].reprovados++
    }

    const lista: TopChecklist[] = Object.entries(mapa)
      .map(([id, v]) => ({
        checklist_id:   id,
        checklist_nome: v.nome,
        total:          v.total,
        reprovados:     v.reprovados,
        taxa:           v.total > 0 ? Math.round((v.reprovados / v.total) * 100) : 0,
      }))
      .filter(c => c.reprovados > 0)
      .sort((a, b) => b.reprovados - a.reprovados)
      .slice(0, 5)

    setTopChecklists(lista)
    setLoadingChecklists(false)
  }, [unidadeId, periodo])

  // ── Top 5 atividades com maior reincidência de não conformidade ───────────
  const carregarTopAtividades = useCallback(async () => {
    if (!unidadeId) return
    setLoadingAtividades(true)
    const sb   = createClient()
    const from = periodoParaISO(periodo)

    // Pega execuções no período para filtrar respostas
    const qExec = sb.from('checklist_execucoes')
      .select('id')
      .eq('status', 'concluido')
      .eq('unidade_id', unidadeId)
      .gte('data_execucao', from)

    const { data: execs } = await qExec
    const execIds = (execs ?? []).map((e: any) => e.id)

    if (execIds.length === 0) { setTopAtividades([]); setLoadingAtividades(false); return }

    // Limita a 500 IDs para não explodir a query
    const execIdsSample = execIds.slice(0, 500)

    const { data: respostas } = await sb
      .from('checklist_execucao_respostas')
      .select('atividade_id, conforme, checklist_atividades(nome, checklists(nome))')
      .in('execucao_id', execIdsSample)
      .not('conforme', 'is', null)

    const mapa: Record<string, { nome: string; checklist: string; total: number; nao_conformes: number }> = {}
    for (const r of (respostas ?? [])) {
      const id  = r.atividade_id
      const nom = (r.checklist_atividades as any)?.nome ?? '—'
      const ck  = (r.checklist_atividades as any)?.checklists?.nome ?? '—'
      if (!mapa[id]) mapa[id] = { nome: nom, checklist: ck, total: 0, nao_conformes: 0 }
      mapa[id].total++
      if (r.conforme === false) mapa[id].nao_conformes++
    }

    const lista: TopAtividade[] = Object.entries(mapa)
      .map(([id, v]) => ({
        atividade_id:    id,
        atividade_nome:  v.nome,
        checklist_nome:  v.checklist,
        nao_conformes:   v.nao_conformes,
        total_respostas: v.total,
        taxa: v.total > 0 ? Math.round((v.nao_conformes / v.total) * 100) : 0,
      }))
      .filter(a => a.nao_conformes > 0)
      .sort((a, b) => b.nao_conformes - a.nao_conformes)
      .slice(0, 5)

    setTopAtividades(lista)
    setLoadingAtividades(false)
  }, [unidadeId, periodo])

  // ── Tickets (resumo) ──────────────────────────────────────────────────────
  const carregarTickets = useCallback(async () => {
    if (!unidadeId) return
    setLoadingTickets(true)
    const sb = createClient()
    const from = periodoParaISO(periodo)
    const { data } = await sb.from('tickets')
      .select('status, prioridade, ticket_categorias(nome)')
      .eq('unidade_id', unidadeId).gte('criado_em', from)
    const rows = (data ?? []) as any[]
    const fechado = (s: string) => STATUS_FECHADOS.includes(s as any)
    const catMap: Record<string, number> = {}
    for (const r of rows) {
      const nome = r.ticket_categorias?.nome
      if (nome) catMap[nome] = (catMap[nome] ?? 0) + 1
    }
    setTickets({
      naoAceitos:   rows.filter(r => STATUS_NAO_ACEITO.includes(r.status)).length,
      emTratamento: rows.filter(r => STATUS_EM_TRATAMENTO.includes(r.status)).length,
      finalizados:  rows.filter(r => fechado(r.status)).length,
      criticos:     rows.filter(r => r.prioridade === 'critica' && !fechado(r.status)).length,
      topCategorias: Object.entries(catMap).map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total).slice(0, 5),
    })
    setLoadingTickets(false)
  }, [unidadeId, periodo])

  // ── Planos de ação (resumo) ───────────────────────────────────────────────
  const carregarPlanos = useCallback(async () => {
    if (!unidadeId) return
    setLoadingPlanos(true)
    const sb = createClient()
    const from = periodoParaISO(periodo)
    const { data } = await sb.from('planos_acao')
      .select('status').eq('unidade_id', unidadeId).gte('created_at', from)
    const rows = (data ?? []) as any[]
    const c = (s: string) => rows.filter(r => r.status === s).length
    setPlanos({
      emModeracao:   c('em_moderacao_n1') + c('em_moderacao_n2'),
      corrigidos:    c('corrigido'),
      naoCorrigidos: c('nao_corrigido'),
      aguardN1:      c('em_moderacao_n1'),
      aguardN2:      c('em_moderacao_n2'),
    })
    setLoadingPlanos(false)
  }, [unidadeId, periodo])

  // ── Tarefas (resumo) ──────────────────────────────────────────────────────
  const carregarTarefas = useCallback(async () => {
    if (!unidadeId) return
    setLoadingTarefas(true)
    const sb = createClient()
    const from = periodoParaISO(periodo)
    const [{ count: listasAtivas }, { data: execs }] = await Promise.all([
      sb.from('tarefa_listas').select('id', { count: 'exact', head: true })
        .eq('unidade_id', unidadeId).eq('status', 'publicada'),
      sb.from('tarefa_execucoes').select('id').eq('unidade_id', unidadeId).gte('aberta_em', from),
    ])
    const execIds = (execs ?? []).map((e: any) => e.id).slice(0, 500)
    let pct = 0
    if (execIds.length) {
      const { data: resp } = await sb.from('tarefa_respostas').select('feito').in('execucao_id', execIds)
      const total = (resp ?? []).length
      const feitos = (resp ?? []).filter((r: any) => r.feito).length
      pct = total > 0 ? Math.round((feitos / total) * 100) : 0
    }
    setTarefas({ listasAtivas: listasAtivas ?? 0, respostas: (execs ?? []).length, pctConcluido: pct })
    setLoadingTarefas(false)
  }, [unidadeId, periodo])

  useEffect(() => { carregarTopChecklists() }, [carregarTopChecklists])
  useEffect(() => { carregarTopAtividades() }, [carregarTopAtividades])
  useEffect(() => { carregarTickets() }, [carregarTickets])
  useEffect(() => { carregarPlanos() },  [carregarPlanos])
  useEffect(() => { carregarTarefas() }, [carregarTarefas])

  function recarregarTudo() {
    carregarTopChecklists()
    carregarTopAtividades()
    carregarTickets()
    carregarPlanos()
    carregarTarefas()
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const cfg = getOnboardingConfig('indicadores')!

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">

      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/gestao')}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart2 size={20} className="text-orange-500" />Indicadores
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Reincidência e desempenho{unidadeAtiva ? ` · ${unidadeAtiva.nome}` : ''}
          </p>
        </div>
        {/* Período */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {PERIODOS.map(p => (
            <button key={p.valor} onClick={() => setPeriodo(p.valor)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                periodo === p.valor ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={recarregarTudo}
          className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* ── Top 5 Checklists ── (oculto se vazio) */}
      {(loadingChecklists || topChecklists.length > 0) && (
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center">
            <TrendingDown size={15} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Top 5 — Checklists mais reprovados</p>
            <p className="text-xs text-gray-400">Por volume de reprovações no período</p>
          </div>
        </div>

        {loadingChecklists ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
        ) : (
          <div className="space-y-3">
            {topChecklists.map((c, idx) => (
              <div key={c.checklist_id} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${
                  idx === 0 ? 'text-red-500' : idx === 1 ? 'text-orange-500' : 'text-gray-400'
                }`}>{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{c.checklist_nome}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <BarHorizontal valor={c.reprovados} max={topChecklists[0].reprovados} cor="bg-red-400" />
                    <span className="text-xs text-gray-500 flex-shrink-0">{c.reprovados} de {c.total}</span>
                  </div>
                </div>
                <TaxaBadge taxa={100 - c.taxa} />
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ── Top 5 Atividades ── (oculto se vazio) */}
      {(loadingAtividades || topAtividades.length > 0) && (
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center">
            <Zap size={15} className="text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Top 5 — Atividades com maior não conformidade</p>
            <p className="text-xs text-gray-400">Pontos de atenção recorrentes no processo</p>
          </div>
        </div>

        {loadingAtividades ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
        ) : (
          <div className="space-y-3">
            {topAtividades.map((a, idx) => (
              <div key={a.atividade_id} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${
                  idx === 0 ? 'text-red-500' : idx === 1 ? 'text-orange-500' : 'text-gray-400'
                }`}>{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{a.atividade_nome}</p>
                  <p className="text-xs text-gray-400 truncate">{a.checklist_nome}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <BarHorizontal valor={a.nao_conformes} max={topAtividades[0].nao_conformes} cor="bg-amber-400" />
                    <span className="text-xs text-gray-500 flex-shrink-0">{a.nao_conformes}/{a.total_respostas}</span>
                  </div>
                </div>
                <TaxaBadge taxa={100 - a.taxa} />
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ── Planos de Ação ── (acima de Tickets; oculto se vazio) */}
      {(loadingPlanos || planos.emModeracao + planos.corrigidos + planos.naoCorrigidos > 0) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center">
              <ClipboardList size={15} className="text-orange-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800">Planos de ação no período</p>
          </div>
          {loadingPlanos ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
              {[
                { label: 'Em moderação', valor: planos.emModeracao, cor: 'text-amber-700', filtro: 'abertos' },
                { label: 'Aguardando N1', valor: planos.aguardN1, cor: 'text-amber-600', filtro: 'n1' },
                { label: 'Aguardando N2', valor: planos.aguardN2, cor: 'text-orange-600', filtro: 'n2' },
                { label: 'Corrigidos', valor: planos.corrigidos, cor: 'text-green-700', filtro: 'corrigido' },
                { label: 'Não corrigidos', valor: planos.naoCorrigidos, cor: 'text-red-600', filtro: 'nao_corrigido' },
              ].map(c => (
                <button key={c.label} onClick={() => router.push(`/gestao/planos-acao?filtro=${c.filtro}`)}
                  className="bg-gray-50 rounded-xl p-3 text-left hover:bg-gray-100 transition-colors">
                  <p className={`text-lg sm:text-2xl font-bold ${c.cor}`}>{c.valor}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{c.label}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tickets ── (oculto se vazio) */}
      {(loadingTickets || tickets.naoAceitos + tickets.emTratamento + tickets.finalizados > 0) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
              <Ticket size={15} className="text-blue-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800">Tickets no período</p>
          </div>
          {loadingTickets ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: 'Em aberto', valor: tickets.naoAceitos, cor: 'text-blue-700', status: 'aberto' },
                { label: 'Em tratamento', valor: tickets.emTratamento, cor: 'text-purple-700', status: 'tratamento' },
                { label: 'Críticos em andamento', valor: tickets.criticos, cor: 'text-red-600', status: 'todos' },
                { label: 'Finalizados', valor: tickets.finalizados, cor: 'text-gray-700', status: 'finalizados' },
              ].map(c => (
                <button key={c.label} onClick={() => router.push(`/gestao/tickets?status=${c.status}`)}
                  className="bg-gray-50 rounded-xl p-3 text-left hover:bg-gray-100 transition-colors">
                  <p className={`text-lg sm:text-2xl font-bold ${c.cor}`}>{c.valor}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{c.label}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Top categorias de tickets ── (card próprio; oculto se vazio) */}
      {!loadingTickets && tickets.topCategorias.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
              <Ticket size={15} className="text-blue-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800">Top categorias de tickets</p>
          </div>
          <div className="space-y-2">
            {tickets.topCategorias.map(c => (
              <div key={c.nome} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 flex-1 truncate">{c.nome}</span>
                <BarHorizontal valor={c.total} max={tickets.topCategorias[0].total} cor="bg-blue-400" />
                <span className="text-xs text-gray-500 flex-shrink-0 w-8 text-right">{c.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tarefas ── (oculto se vazio) */}
      {(loadingTarefas || tarefas.listasAtivas + tarefas.respostas > 0) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-teal-50 rounded-xl flex items-center justify-center">
              <ListChecks size={15} className="text-teal-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800">Tarefas no período</p>
          </div>
          {loadingTarefas ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: 'Listas ativas', valor: tarefas.listasAtivas, cor: 'text-teal-700' },
                { label: 'Respostas', valor: tarefas.respostas, cor: 'text-gray-700' },
                { label: '% concluído', valor: `${tarefas.pctConcluido}%`, cor: 'text-green-700' },
              ].map(c => (
                <button key={c.label} onClick={() => router.push('/gestao/tarefas')}
                  className="bg-gray-50 rounded-xl p-3 text-left hover:bg-gray-100 transition-colors">
                  <p className={`text-lg sm:text-2xl font-bold ${c.cor}`}>{c.valor}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{c.label}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sem nenhum dado no período (todos os grupos vazios) */}
      {!loadingChecklists && !loadingAtividades && !loadingTickets && !loadingPlanos && !loadingTarefas
        && topChecklists.length === 0 && topAtividades.length === 0
        && tickets.naoAceitos + tickets.emTratamento + tickets.finalizados === 0
        && planos.emModeracao + planos.corrigidos + planos.naoCorrigidos === 0
        && tarefas.listasAtivas + tarefas.respostas === 0 && (
        <div className="text-center py-12">
          <Trophy size={32} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Sem dados no período nesta unidade.</p>
        </div>
      )}

    </div>
  )
}
