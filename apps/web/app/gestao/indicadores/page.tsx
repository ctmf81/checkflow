'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import {
  BarChart2, ArrowLeft, Loader2, RefreshCw,
  TrendingDown, ClipboardList, Zap, Trophy,
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

interface TaxaUnidade {
  unidade_id: string
  unidade_nome: string
  total: number
  aprovados: number
  taxa_aprovacao: number
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
  const [periodo, setPeriodo] = useState<Periodo>('24h')
  const [isAdmin, setIsAdmin] = useState(false)
  const [unidadeIds, setUnidadeIds] = useState<string[]>([])
  const [pronto, setPronto] = useState(false)

  const [topChecklists, setTopChecklists] = useState<TopChecklist[]>([])
  const [topAtividades, setTopAtividades] = useState<TopAtividade[]>([])
  const [taxaUnidades, setTaxaUnidades]   = useState<TaxaUnidade[]>([])

  const [loadingChecklists, setLoadingChecklists] = useState(true)
  const [loadingAtividades, setLoadingAtividades] = useState(true)
  const [loadingUnidades,   setLoadingUnidades]   = useState(true)

  // Escopo do usuário
  useEffect(() => {
    async function init() {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const admin = user.user_metadata?.role === 'admin_sistema'
      setIsAdmin(admin)
      if (!admin) {
        const { data: uu } = await sb.from('usuario_unidade').select('unidade_id').eq('usuario_id', user.id)
        setUnidadeIds((uu ?? []).map((r: any) => r.unidade_id))
      }
      setPronto(true)
    }
    init()
  }, [])

  // ── Top 5 checklists com maior reincidência de reprovação ─────────────────
  const carregarTopChecklists = useCallback(async () => {
    if (!pronto) return
    setLoadingChecklists(true)
    const sb   = createClient()
    const from = periodoParaISO(periodo)

    let q = sb.from('checklist_execucoes')
      .select('checklist_id, resultado, checklists(nome)')
      .eq('status', 'concluido')
      .gte('data_execucao', from)

    if (!isAdmin && unidadeIds.length > 0) q = q.in('unidade_id', unidadeIds)

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
  }, [pronto, periodo, isAdmin, unidadeIds])

  // ── Top 5 atividades com maior reincidência de não conformidade ───────────
  const carregarTopAtividades = useCallback(async () => {
    if (!pronto) return
    setLoadingAtividades(true)
    const sb   = createClient()
    const from = periodoParaISO(periodo)

    // Pega execuções no período para filtrar respostas
    let qExec = sb.from('checklist_execucoes')
      .select('id')
      .eq('status', 'concluido')
      .gte('data_execucao', from)

    if (!isAdmin && unidadeIds.length > 0) qExec = qExec.in('unidade_id', unidadeIds)

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
  }, [pronto, periodo, isAdmin, unidadeIds])

  // ── Taxa de aprovação por unidade ─────────────────────────────────────────
  const carregarTaxaUnidades = useCallback(async () => {
    if (!pronto || !isAdmin) { setLoadingUnidades(false); return }
    setLoadingUnidades(true)
    const sb   = createClient()
    const from = periodoParaISO(periodo)

    const { data } = await sb.from('checklist_execucoes')
      .select('unidade_id, resultado, unidades(nome)')
      .eq('status', 'concluido')
      .gte('data_execucao', from)

    const mapa: Record<string, { nome: string; total: number; aprovados: number }> = {}
    for (const r of (data ?? [])) {
      const id   = r.unidade_id
      const nome = (r.unidades as any)?.nome ?? '—'
      if (!mapa[id]) mapa[id] = { nome, total: 0, aprovados: 0 }
      mapa[id].total++
      if (r.resultado === 'aprovado') mapa[id].aprovados++
    }

    const lista: TaxaUnidade[] = Object.entries(mapa)
      .map(([id, v]) => ({
        unidade_id:      id,
        unidade_nome:    v.nome,
        total:           v.total,
        aprovados:       v.aprovados,
        taxa_aprovacao:  v.total > 0 ? Math.round((v.aprovados / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.taxa_aprovacao - b.taxa_aprovacao) // piores primeiro
      .slice(0, 8)

    setTaxaUnidades(lista)
    setLoadingUnidades(false)
  }, [pronto, periodo, isAdmin])

  useEffect(() => { carregarTopChecklists() }, [carregarTopChecklists])
  useEffect(() => { carregarTopAtividades() }, [carregarTopAtividades])
  useEffect(() => { carregarTaxaUnidades() },  [carregarTaxaUnidades])

  function recarregarTudo() {
    carregarTopChecklists()
    carregarTopAtividades()
    carregarTaxaUnidades()
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
          <p className="text-sm text-gray-400 mt-0.5">Análise de reincidência e desempenho</p>
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

      {/* ── Top 5 Checklists ── */}
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
        ) : topChecklists.length === 0 ? (
          <div className="text-center py-8">
            <Trophy size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhuma reprovação no período. 🎉</p>
          </div>
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

      {/* ── Top 5 Atividades ── */}
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
        ) : topAtividades.length === 0 ? (
          <div className="text-center py-8">
            <Trophy size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhuma não conformidade no período. 🎉</p>
          </div>
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

      {/* ── Taxa por unidade (só admin) ── */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
              <ClipboardList size={15} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Taxa de aprovação por unidade</p>
              <p className="text-xs text-gray-400">Piores unidades primeiro</p>
            </div>
          </div>

          {loadingUnidades ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
          ) : taxaUnidades.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sem dados no período.</p>
          ) : (
            <div className="space-y-3">
              {taxaUnidades.map(u => (
                <div key={u.unidade_id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{u.unidade_nome}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <BarHorizontal valor={u.aprovados} max={u.total} cor="bg-blue-400" />
                      <span className="text-xs text-gray-500 flex-shrink-0">{u.aprovados}/{u.total}</span>
                    </div>
                  </div>
                  <TaxaBadge taxa={u.taxa_aprovacao} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
