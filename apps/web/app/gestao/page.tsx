'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, ClipboardList,
  ChevronRight, Loader2, RefreshCw, FileText, BarChart2,
  Filter, TrendingDown,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Periodo = '1h' | '6h' | '12h' | '24h' | '15d' | '30d'

interface Funil {
  executados: number
  aprovados: number
  reprovados: number
  em_moderacao: number
}

interface ExecucaoItem {
  id: string
  checklist_nome: string
  data_execucao: string
  resultado: 'aprovado' | 'reprovado' | null
  pdf_url: string | null
  planos_abertos: number
}

interface PlanoSla {
  id: string
  identificador: string | null
  atividade_nome: string
  checklist_nome: string
  sla_prazo: string
  horas_restantes: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIODOS: { valor: Periodo; label: string }[] = [
  { valor: '1h',  label: '1h' },
  { valor: '6h',  label: '6h' },
  { valor: '12h', label: '12h' },
  { valor: '24h', label: '24h' },
  { valor: '15d', label: '15d' },
  { valor: '30d', label: '30d' },
]

function periodoParaISO(p: Periodo): string {
  const agora = Date.now()
  const mapa: Record<Periodo, number> = {
    '1h':  60 * 60 * 1000,
    '6h':  6  * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '15d': 15 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  }
  return new Date(agora - mapa[p]).toISOString()
}

function dataRelativa(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 60)  return `${min}min atrás`
  const h = Math.floor(diff / 3600000)
  if (h < 24)   return `${h}h atrás`
  const d = Math.floor(diff / 86400000)
  return `${d}d atrás`
}

function FunilBar({ valor, total, cor }: { valor: number; total: number; cor: string }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full transition-all ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function GestaoHomePage() {
  const router = useRouter()
  const [periodo, setPeriodo] = useState<Periodo>('24h')
  const [filtroExec, setFiltroExec] = useState<'todos' | 'reprovado' | 'pa_aberto'>('todos')
  const [funil, setFunil] = useState<Funil>({ executados: 0, aprovados: 0, reprovados: 0, em_moderacao: 0 })
  const [execucoes, setExecucoes] = useState<ExecucaoItem[]>([])
  const [planosSla, setPlanosSla] = useState<PlanoSla[]>([])
  const [loadingFunil, setLoadingFunil] = useState(true)
  const [loadingExec, setLoadingExec]   = useState(true)
  const [loadingSla,  setLoadingSla]    = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [unidadeIds, setUnidadeIds] = useState<string[]>([])
  const [pronto, setPronto] = useState(false)

  // 1. Descobre escopo do usuário (admin = todas unidades, senão só as suas)
  useEffect(() => {
    async function init() {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return

      const admin = user.user_metadata?.role === 'admin_sistema'
      setIsAdmin(admin)

      if (!admin) {
        const { data: uu } = await sb
          .from('usuario_unidade')
          .select('unidade_id')
          .eq('usuario_id', user.id)
        setUnidadeIds((uu ?? []).map((r: any) => r.unidade_id))
      }
      setPronto(true)
    }
    init()
  }, [])

  // 2. Funil — depende do período
  const carregarFunil = useCallback(async () => {
    if (!pronto) return
    setLoadingFunil(true)
    const sb   = createClient()
    const from = periodoParaISO(periodo)

    let q = sb.from('checklist_execucoes')
      .select('resultado, status')
      .gte('data_execucao', from)
      .eq('status', 'concluido')

    if (!isAdmin && unidadeIds.length > 0) {
      q = q.in('unidade_id', unidadeIds)
    }

    const { data } = await q
    const rows = data ?? []

    setFunil({
      executados:    rows.length,
      aprovados:     rows.filter(r => r.resultado === 'aprovado').length,
      reprovados:    rows.filter(r => r.resultado === 'reprovado').length,
      em_moderacao:  rows.filter(r => r.resultado === 'reprovado').length, // planos abertos — aproximado
    })
    setLoadingFunil(false)
  }, [pronto, periodo, isAdmin, unidadeIds])

  // 3. Últimas execuções
  const carregarExecucoes = useCallback(async () => {
    if (!pronto) return
    setLoadingExec(true)
    const sb = createClient()

    let q = sb.from('checklist_execucoes')
      .select(`
        id, resultado, data_execucao, pdf_url,
        checklists(nome),
        planos_acao(id, status)
      `)
      .eq('status', 'concluido')
      .order('data_execucao', { ascending: false })
      .limit(50)

    if (!isAdmin && unidadeIds.length > 0) {
      q = q.in('unidade_id', unidadeIds)
    }

    const { data } = await q
    let rows: ExecucaoItem[] = (data ?? []).map((e: any) => ({
      id: e.id,
      checklist_nome: e.checklists?.nome ?? '—',
      data_execucao: e.data_execucao,
      resultado: e.resultado,
      pdf_url: e.pdf_url ?? null,
      planos_abertos: (e.planos_acao ?? []).filter(
        (p: any) => p.status === 'em_moderacao_n1' || p.status === 'em_moderacao_n2'
      ).length,
    }))

    if (filtroExec === 'reprovado') {
      rows = rows.filter(r => r.resultado === 'reprovado')
    } else if (filtroExec === 'pa_aberto') {
      rows = rows.filter(r => r.planos_abertos > 0)
    }

    setExecucoes(rows.slice(0, 20))
    setLoadingExec(false)
  }, [pronto, filtroExec, isAdmin, unidadeIds])

  // 4. Planos com SLA vencendo (próximas 8h ou já vencido)
  const carregarPlanosSla = useCallback(async () => {
    if (!pronto) return
    setLoadingSla(true)
    const sb = createClient()
    const em8h = new Date(Date.now() + 8 * 3600000).toISOString()

    const { data } = await sb.from('planos_acao')
      .select(`
        id, identificador, sla_prazo,
        checklist_atividades(nome),
        checklist_execucoes(checklists(nome))
      `)
      .in('status', ['em_moderacao_n1', 'em_moderacao_n2'])
      .not('sla_prazo', 'is', null)
      .lte('sla_prazo', em8h)
      .order('sla_prazo', { ascending: true })
      .limit(10)

    setPlanosSla((data ?? []).map((p: any) => ({
      id: p.id,
      identificador: p.identificador ?? null,
      atividade_nome: p.checklist_atividades?.nome ?? '—',
      checklist_nome: p.checklist_execucoes?.checklists?.nome ?? '—',
      sla_prazo: p.sla_prazo,
      horas_restantes: Math.round((new Date(p.sla_prazo).getTime() - Date.now()) / 3600000),
    })))
    setLoadingSla(false)
  }, [pronto, isAdmin, unidadeIds])

  useEffect(() => { carregarFunil() },     [carregarFunil])
  useEffect(() => { carregarExecucoes() }, [carregarExecucoes])
  useEffect(() => { carregarPlanosSla() }, [carregarPlanosSla])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Visão Geral</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isAdmin ? 'Todas as unidades' : 'Suas unidades'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/gestao/indicadores')}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 hover:text-orange-500 transition-colors">
            <BarChart2 size={13} />Indicadores
          </button>
          <button
            onClick={() => { carregarFunil(); carregarExecucoes(); carregarPlanosSla() }}
            className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ── Funil ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-700">Funil de Execuções</p>
          {/* Seletor de período */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {PERIODOS.map(p => (
              <button key={p.valor} onClick={() => setPeriodo(p.valor)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  periodo === p.valor ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loadingFunil ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Executados',   valor: funil.executados,   cor: 'text-gray-700',   barCor: 'bg-gray-400',   icon: <ClipboardList size={14} /> },
              { label: 'Aprovados',    valor: funil.aprovados,    cor: 'text-green-700',  barCor: 'bg-green-500',  icon: <CheckCircle2  size={14} /> },
              { label: 'Reprovados',   valor: funil.reprovados,   cor: 'text-red-700',    barCor: 'bg-red-500',    icon: <XCircle       size={14} /> },
              { label: 'Em moderação', valor: funil.em_moderacao, cor: 'text-amber-700',  barCor: 'bg-amber-500',  icon: <Clock         size={14} /> },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${item.cor}`}>
                  {item.icon}{item.label}
                </div>
                <p className={`text-2xl font-bold ${item.cor}`}>{item.valor}</p>
                <FunilBar valor={item.valor} total={funil.executados} cor={item.barCor} />
                <p className="text-xs text-gray-400 mt-1">
                  {funil.executados > 0 ? Math.round((item.valor / funil.executados) * 100) : 0}%
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SLA vencendo ── */}
      {(loadingSla || planosSla.length > 0) && (
        <div className="bg-white border border-red-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={15} className="text-red-500" />
            <p className="text-sm font-semibold text-red-700">Planos com SLA crítico</p>
            <span className="text-xs text-red-400 ml-auto">Vencendo nas próximas 8h</span>
          </div>

          {loadingSla ? (
            <div className="flex justify-center py-4">
              <Loader2 size={18} className="animate-spin text-gray-300" />
            </div>
          ) : (
            <div className="space-y-2">
              {planosSla.map(p => (
                <button key={p.id}
                  onClick={() => router.push(`/gestao/planos-acao/${p.id}`)}
                  className="w-full flex items-center gap-3 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl px-3 py-2.5 text-left transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {p.identificador && (
                        <span className="text-xs font-mono font-bold text-red-600">{p.identificador}</span>
                      )}
                      <span className="text-xs font-semibold text-red-800 truncate">{p.atividade_nome}</span>
                    </div>
                    <p className="text-xs text-red-400 truncate mt-0.5">{p.checklist_nome}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-xs font-bold ${p.horas_restantes < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {p.horas_restantes < 0
                        ? `Vencido ${Math.abs(p.horas_restantes)}h`
                        : `${p.horas_restantes}h restantes`}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-red-300 group-hover:text-red-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Últimas execuções ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-700">Últimas Execuções</p>
          {/* Filtro */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {([
              { valor: 'todos',      label: 'Todos' },
              { valor: 'reprovado',  label: 'Reprovados' },
              { valor: 'pa_aberto', label: 'Com PA' },
            ] as const).map(f => (
              <button key={f.valor} onClick={() => setFiltroExec(f.valor)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  filtroExec === f.valor ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loadingExec ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : execucoes.length === 0 ? (
          <div className="text-center py-8">
            <Filter size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhuma execução encontrada.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {execucoes.map(e => (
              <div key={e.id}
                className="flex items-center gap-3 border border-gray-100 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors">
                {/* Ícone resultado */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  e.resultado === 'aprovado' ? 'bg-green-50' : e.resultado === 'reprovado' ? 'bg-red-50' : 'bg-gray-50'
                }`}>
                  {e.resultado === 'aprovado'
                    ? <CheckCircle2 size={15} className="text-green-500" />
                    : e.resultado === 'reprovado'
                      ? <XCircle size={15} className="text-red-500" />
                      : <ClipboardList size={15} className="text-gray-400" />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{e.checklist_nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400">{dataRelativa(e.data_execucao)}</p>
                    {e.planos_abertos > 0 && (
                      <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0 rounded-full font-medium">
                        {e.planos_abertos} PA
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {e.pdf_url && (
                    <a href={e.pdf_url} target="_blank" rel="noopener noreferrer"
                      title="Baixar PDF"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                      <FileText size={14} />
                    </a>
                  )}
                  {e.planos_abertos > 0 && (
                    <button
                      onClick={() => router.push(`/gestao/planos-acao?exec=${e.id}`)}
                      title="Ver planos de ação"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                      <TrendingDown size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/gestao/planos-acao`)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
