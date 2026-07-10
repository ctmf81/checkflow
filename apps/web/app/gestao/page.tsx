'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  CheckCircle2, XCircle, Clock, ClipboardList,
  ChevronRight, Loader2, RefreshCw, BarChart2,
  Filter, TrendingDown,
} from 'lucide-react'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { PrimeirosPassos } from '@/components/onboarding/PrimeirosPassos'
import { useSession } from '@/contexts/SessionContext'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Periodo = '1h' | '6h' | '12h' | '24h' | '15d' | '30d'

interface Funil {
  executados: number
  aprovados: number
  reprovados: number
  corrigidos: number     // EXECUÇÕES reprovadas cujos planos foram todos corrigidos
  nao_corrigidos: number // EXECUÇÕES reprovadas com algum plano não corrigido
  em_moderacao: number   // EXECUÇÕES com ao menos um plano em moderação
  aguardando_n1: number  // PLANOS aguardando N1 (em_moderacao_n1 + reaberto)
  aguardando_n2: number  // PLANOS aguardando N2 (em_moderacao_n2)
}

interface ExecucaoItem {
  id: string
  checklist_nome: string
  data_execucao: string
  resultado: 'aprovado' | 'reprovado' | null
  pdf_url: string | null
  planos_abertos: number
  planos: { status: string }[]
}

// Resume o status dos planos de ação de uma execução reprovada, para exibir
// junto do badge "Reprovado" (ex: "Aguarda N1", "Corrigido")
function resumoPlanos(planos: { status: string }[]): { label: string; cor: string } | null {
  if (!planos.length) return null
  if (planos.some(p => p.status === 'em_moderacao_n2')) return { label: 'Aguarda N2', cor: 'amber' }
  if (planos.some(p => p.status === 'em_moderacao_n1' || p.status === 'reaberto')) return { label: 'Aguarda N1', cor: 'amber' }
  if (planos.some(p => p.status === 'nao_corrigido')) return { label: 'Não corrigido', cor: 'red' }
  if (planos.every(p => p.status === 'corrigido')) return { label: 'Corrigido', cor: 'green' }
  return null
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
  const { unidadeAtiva } = useSession()
  const [periodo, setPeriodo] = useState<Periodo>('24h')
  const [filtroExec, setFiltroExec] = useState<'todos' | 'reprovado' | 'pa_aberto'>('todos')
  const [funil, setFunil] = useState<Funil>({ executados: 0, aprovados: 0, reprovados: 0, corrigidos: 0, nao_corrigidos: 0, em_moderacao: 0, aguardando_n1: 0, aguardando_n2: 0 })
  const [execucoes, setExecucoes] = useState<ExecucaoItem[]>([])
  const [loadingFunil, setLoadingFunil] = useState(true)
  const [loadingExec, setLoadingExec]   = useState(true)

  // Toda a Home é escopada pela UNIDADE ATIVA da sessão (como as demais telas).
  // O admin da empresa troca de unidade para ver cada uma; RLS garante o acesso.
  const unidadeId = unidadeAtiva?.id ?? null

  // 2. Funil — depende do período
  const carregarFunil = useCallback(async () => {
    if (!unidadeId) return
    setLoadingFunil(true)
    const sb   = createClient()
    const from = periodoParaISO(periodo)

    const q = sb.from('checklist_execucoes')
      .select('resultado, status, planos_acao(status)')
      .gte('data_execucao', from)
      .eq('status', 'concluido')
      .eq('unidade_id', unidadeId)

    const { data } = await q
    const rows = (data ?? []) as any[]

    const emMod = (p: any) => p.status === 'em_moderacao_n1' || p.status === 'em_moderacao_n2'
    const reprovadas = rows.filter(r => r.resultado === 'reprovado')
    // Classifica cada reprovada pelo desfecho do tratamento (mesma regra do badge)
    const labelReprovada = (r: any) => resumoPlanos((r.planos_acao ?? []).map((p: any) => ({ status: p.status })))?.label
    setFunil({
      executados:    rows.length,
      aprovados:     rows.filter(r => r.resultado === 'aprovado').length,
      reprovados:    reprovadas.length,
      corrigidos:    reprovadas.filter(r => labelReprovada(r) === 'Corrigido').length,
      nao_corrigidos: reprovadas.filter(r => labelReprovada(r) === 'Não corrigido').length,
      // EXECUÇÕES que têm ao menos um plano em moderação (nível de execução)
      em_moderacao:  rows.filter(r => (r.planos_acao ?? []).some(emMod)).length,
      // PLANOS aguardando cada nível (nível de plano) — para o indicador de moderação
      aguardando_n1: rows.reduce((acc, r) => acc + (r.planos_acao ?? []).filter(
        (p: any) => p.status === 'em_moderacao_n1' || p.status === 'reaberto').length, 0),
      aguardando_n2: rows.reduce((acc, r) => acc + (r.planos_acao ?? []).filter(
        (p: any) => p.status === 'em_moderacao_n2').length, 0),
    })
    setLoadingFunil(false)
  }, [unidadeId, periodo])

  // 3. Últimas execuções
  const carregarExecucoes = useCallback(async () => {
    if (!unidadeId) return
    setLoadingExec(true)
    const sb = createClient()

    const q = sb.from('checklist_execucoes')
      .select(`
        id, resultado, data_execucao, pdf_url,
        checklists(nome),
        planos_acao(id, status)
      `)
      .eq('status', 'concluido')
      .eq('unidade_id', unidadeId)
      .order('data_execucao', { ascending: false })
      .limit(50)

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
      planos: (e.planos_acao ?? []).map((p: any) => ({ status: p.status })),
    }))

    if (filtroExec === 'reprovado') {
      rows = rows.filter(r => r.resultado === 'reprovado')
    } else if (filtroExec === 'pa_aberto') {
      rows = rows.filter(r => r.planos_abertos > 0)
    }

    setExecucoes(rows.slice(0, 20))
    setLoadingExec(false)
  }, [unidadeId, filtroExec])

  useEffect(() => { carregarFunil() },     [carregarFunil])
  useEffect(() => { carregarExecucoes() }, [carregarExecucoes])

  // ─── Render ────────────────────────────────────────────────────────────────

  const cfg = getOnboardingConfig('gestao-home')!

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">

      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />

      <PrimeirosPassos />

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Visão Geral</h1>
          <p className="hidden sm:block text-sm text-gray-400 mt-0.5">
            {unidadeAtiva ? `Unidade: ${unidadeAtiva.nome}` : 'Selecione uma unidade'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/gestao/indicadores')}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 hover:text-orange-500 transition-colors">
            <BarChart2 size={13} />Indicadores
          </button>
          <button
            onClick={() => { carregarFunil(); carregarExecucoes() }}
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
                  ['6h', '15d', '30d'].includes(p.valor) ? 'hidden sm:inline-flex' : ''
                } ${
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {[
              { label: 'Executados',     valor: funil.executados,     cor: 'text-gray-700',   barCor: 'bg-gray-400',   icon: <ClipboardList size={14} /> },
              { label: 'Aprovados',      valor: funil.aprovados,      cor: 'text-green-700',  barCor: 'bg-green-500',   icon: <CheckCircle2  size={14} /> },
              { label: 'Corrigidos',     valor: funil.corrigidos,     cor: 'text-emerald-700', barCor: 'bg-emerald-500', icon: <CheckCircle2  size={14} /> },
              { label: 'Não corrigidos', valor: funil.nao_corrigidos, cor: 'text-red-700',    barCor: 'bg-red-500',     icon: <XCircle       size={14} /> },
              { label: 'Em moderação',   valor: funil.em_moderacao,   cor: 'text-amber-700',  barCor: 'bg-amber-500',   icon: <Clock         size={14} /> },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 truncate ${item.cor}`}>
                  {item.icon}<span className="truncate">{item.label}</span>
                </div>
                <p className={`text-lg sm:text-2xl font-bold ${item.cor}`}>{item.valor}</p>
                <FunilBar valor={item.valor} total={funil.executados} cor={item.barCor} />
                <p className="text-xs text-gray-400 mt-1">
                  {funil.executados > 0 ? Math.round((item.valor / funil.executados) * 100) : 0}%
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Moderação de planos (nível de plano): quantos aguardam N1 e N2 */}
        {!loadingFunil && (funil.aguardando_n1 > 0 || funil.aguardando_n2 > 0) && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs font-medium text-gray-500">Planos em moderação:</span>
            <button onClick={() => router.push('/gestao/planos-acao')}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100 transition-colors">
              <Clock size={12} />Aguardando N1: <span className="font-bold">{funil.aguardando_n1}</span>
            </button>
            <button onClick={() => router.push('/gestao/planos-acao')}
              className="flex items-center gap-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1 hover:bg-orange-100 transition-colors">
              <Clock size={12} />Aguardando N2: <span className="font-bold">{funil.aguardando_n2}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Últimas execuções ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-700">Execuções</p>
          {/* Filtro */}
          <select value={filtroExec} onChange={e => setFiltroExec(e.target.value as typeof filtroExec)}
            className="text-xs font-medium text-gray-600 bg-gray-100 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200">
            <option value="todos">Todos</option>
            <option value="reprovado">Reprovados</option>
            <option value="pa_aberto">Com PA</option>
          </select>
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
            {execucoes.map(e => {
              const pa = e.resultado === 'reprovado' ? resumoPlanos(e.planos) : null
              return (
              <div key={e.id}
                className="border border-gray-100 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  {/* Ícone resultado */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    e.resultado === 'aprovado' || pa?.cor === 'green' ? 'bg-green-50' :
                    pa?.cor === 'amber' ? 'bg-amber-50' :
                    e.resultado === 'reprovado' ? 'bg-red-50' : 'bg-gray-50'
                  }`}>
                    {e.resultado === 'aprovado' || pa?.cor === 'green'
                      ? <CheckCircle2 size={15} className="text-green-500" />
                      : pa?.cor === 'amber'
                        ? <Clock size={15} className="text-amber-500" />
                        : e.resultado === 'reprovado'
                          ? <XCircle size={15} className="text-red-500" />
                          : <ClipboardList size={15} className="text-gray-400" />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{e.checklist_nome}</p>
                    {/* Tempo e status cada um em sua própria linha */}
                    <p className="text-xs text-gray-400 mt-0.5">{dataRelativa(e.data_execucao)}</p>
                    {e.resultado === 'reprovado' && (
                      <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded-full font-medium border ${
                        pa?.cor === 'green'  ? 'bg-green-50 text-green-600 border-green-200' :
                        pa?.cor === 'amber'  ? 'bg-amber-50 text-amber-600 border-amber-200' :
                        pa?.cor === 'red'    ? 'bg-red-50 text-red-600 border-red-200' :
                        'bg-red-50 text-red-500 border-red-200'
                      }`}>
                        {pa ? (pa.cor === 'amber' ? pa.label : `Reprovado · ${pa.label}`) : 'Reprovado'}
                      </span>
                    )}
                  </div>

                  {/* Ações — PDF fica dentro da página de visualização da execução */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {e.planos_abertos > 0 && (
                      <button
                        onClick={() => router.push(`/gestao/planos-acao?exec=${e.id}`)}
                        title="Ver planos de ação"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                        <TrendingDown size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/gestao/execucoes/${e.id}`)}
                      title="Abrir execução"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

    </div>
  )
}
