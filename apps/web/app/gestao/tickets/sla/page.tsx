'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

interface Categoria { id: string; nome: string; pai_id: string | null }

type Prioridade = 'critica' | 'alta' | 'media' | 'baixa'
const PRIORIDADES: Prioridade[] = ['critica', 'alta', 'media', 'baixa']
const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa',
}

interface SlaRow {
  id?: string
  categoria_id: string | null   // null = padrão da unidade
  prioridade: Prioridade
  tempo_aceite_min: number
  tempo_resolucao_min: number
  _dirty?: boolean
}

function minParaHhmm(min: number): string {
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}h${m}min` : `${h}h`
}

export default function SlaConfigPage() {
  const { unidadeAtiva } = useSession()
  const supabase = createClient()

  const [cats, setCats]     = useState<Categoria[]>([])
  const [rows, setRows]     = useState<SlaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk]         = useState(false)

  async function carregar() {
    if (!unidadeAtiva) return
    setLoading(true)
    const [{ data: cData }, { data: sData }] = await Promise.all([
      supabase.from('ticket_categorias').select('id, nome, pai_id').eq('unidade_id', unidadeAtiva.id).eq('ativo', true).order('nome'),
      supabase.from('ticket_sla_config').select('*').eq('unidade_id', unidadeAtiva.id),
    ])
    setCats(cData ?? [])
    // garante uma linha de padrão para cada prioridade se não existir
    const existentes: SlaRow[] = sData ?? []
    const padrao = PRIORIDADES.map(p => {
      const ex = existentes.find(r => r.categoria_id === null && r.prioridade === p)
      return ex ?? { categoria_id: null, prioridade: p, tempo_aceite_min: 60, tempo_resolucao_min: 480 }
    })
    const catRows = existentes.filter(r => r.categoria_id !== null)
    setRows([...padrao, ...catRows])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva])

  function atualizar(idx: number, campo: 'tempo_aceite_min' | 'tempo_resolucao_min', valor: number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [campo]: valor, _dirty: true } : r))
  }

  function adicionarLinha(categoriaId: string, prioridade: Prioridade) {
    if (rows.find(r => r.categoria_id === categoriaId && r.prioridade === prioridade)) return
    setRows(prev => [...prev, { categoria_id: categoriaId, prioridade, tempo_aceite_min: 60, tempo_resolucao_min: 480, _dirty: true }])
  }

  function removerLinha(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  async function salvar() {
    if (!unidadeAtiva) return
    setSalvando(true)
    const sujas = rows.filter(r => r._dirty)
    for (const r of sujas) {
      const payload = {
        unidade_id: unidadeAtiva.id,
        categoria_id: r.categoria_id,
        prioridade: r.prioridade,
        tempo_aceite_min: r.tempo_aceite_min,
        tempo_resolucao_min: r.tempo_resolucao_min,
      }
      if (r.id) {
        await supabase.from('ticket_sla_config').update(payload).eq('id', r.id)
      } else {
        await supabase.from('ticket_sla_config').upsert(payload, { onConflict: 'unidade_id,categoria_id,prioridade' })
      }
    }
    setSalvando(false); setOk(true)
    setTimeout(() => setOk(false), 2500)
    carregar()
  }

  const categorias = cats.filter(c => !c.pai_id)   // só raízes disponíveis para SLA específico

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando…</div>

  const cfg = getOnboardingConfig('tickets-sla')!

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Configuração de SLA</h1>
          <p className="hidden sm:block text-sm text-gray-500 mt-0.5">
            Prazos de aceite e resolução por prioridade. Linhas com categoria específica sobrepõem o padrão.
          </p>
        </div>
        <button onClick={salvar} disabled={salvando}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {ok ? 'Salvo!' : 'Salvar'}
        </button>
      </div>

      {/* Padrão da unidade */}
      <div className="bg-white rounded-xl border border-gray-100 mb-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/60">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Padrão da unidade</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Prioridade</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Aceite (min)</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Resolução (min)</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-400">Equiv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.filter(r => r.categoria_id === null).map((r, i) => (
                <tr key={r.prioridade} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-700">{PRIORIDADE_LABEL[r.prioridade]}</td>
                  <td className="px-4 py-2.5">
                    <input type="number" min={5} step={5} value={r.tempo_aceite_min}
                      onChange={e => atualizar(i, 'tempo_aceite_min', Number(e.target.value))}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="number" min={5} step={5} value={r.tempo_resolucao_min}
                      onChange={e => atualizar(i, 'tempo_resolucao_min', Number(e.target.value))}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                    aceite {minParaHhmm(r.tempo_aceite_min)} / resolução {minParaHhmm(r.tempo_resolucao_min)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SLA por categoria */}
      {rows.filter(r => r.categoria_id !== null).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/60">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Por categoria (sobrepõe o padrão)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Categoria</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Prioridade</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Aceite (min)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Resolução (min)</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => {
                  if (!r.categoria_id) return null
                  const cat = cats.find(c => c.id === r.categoria_id)
                  return (
                    <tr key={`${r.categoria_id}-${r.prioridade}`} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-700">{cat?.nome ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{PRIORIDADE_LABEL[r.prioridade]}</td>
                      <td className="px-4 py-2.5">
                        <input type="number" min={5} step={5} value={r.tempo_aceite_min}
                          onChange={e => atualizar(i, 'tempo_aceite_min', Number(e.target.value))}
                          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="number" min={5} step={5} value={r.tempo_resolucao_min}
                          onChange={e => atualizar(i, 'tempo_resolucao_min', Number(e.target.value))}
                          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => removerLinha(i)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adicionar SLA específico */}
      {categorias.length > 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">Adicionar SLA específico por categoria</p>
          <div className="flex gap-3 flex-wrap">
            <select id="cat-sel" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select id="pri-sel" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PRIORIDADES.map(p => <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>)}
            </select>
            <button
              onClick={() => {
                const catSel = (document.getElementById('cat-sel') as HTMLSelectElement).value
                const priSel = (document.getElementById('pri-sel') as HTMLSelectElement).value as Prioridade
                adicionarLinha(catSel, priSel)
              }}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">
              <Plus size={14} /> Adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
