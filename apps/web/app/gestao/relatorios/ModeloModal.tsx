'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast } from '@/components/ui/feedback'
import { montarPromptModelo, type SecaoEstrutura } from '@/lib/relatorios/montarPrompt'

export interface ModeloRelatorio {
  id: string
  nome: string
  checklist_id: string
  periodo_horas: number
  prompt: string
}

interface Props {
  unidadeId: string
  modelo?: ModeloRelatorio | null   // presente = edição
  onClose: () => void
  onSalvo: () => void
}

interface ChecklistOpt { id: string; nome: string; subgrupo_id: string | null }

export function ModeloModal({ unidadeId, modelo, onClose, onSalvo }: Props) {
  const toast = useToast()
  const { grupoLabel, subgrupoLabel } = useSession()
  const edicao = !!modelo

  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [checklistId, setChecklistId] = useState(modelo?.checklist_id ?? '')
  const [periodoHoras, setPeriodoHoras] = useState(modelo?.periodo_horas ?? 24)
  const [prompt, setPrompt] = useState(modelo?.prompt ?? '')
  const [checklists, setChecklists] = useState<ChecklistOpt[]>([])
  const [grupos, setGrupos] = useState<{ id: string; nome: string; display_name: string | null }[]>([])
  const [subgrupos, setSubgrupos] = useState<{ id: string; nome: string }[]>([])
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [filtroSubgrupo, setFiltroSubgrupo] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Se o usuário editou o prompt à mão, não sobrescreve ao trocar de checklist.
  const promptTocado = useRef(edicao)

  useEffect(() => {
    const sb = createClient()
    sb.from('checklists')
      .select('id, nome, subgrupo_id').eq('unidade_id', unidadeId).eq('status', 'publicado').order('nome')
      .then(({ data }) => setChecklists(data ?? []))
    sb.from('grupos')
      .select('id, nome, display_name').eq('unidade_id', unidadeId).eq('status', 'ativo').order('nome')
      .then(({ data }) => setGrupos(data ?? []))
  }, [unidadeId])

  // Carrega subgrupos ao escolher um grupo (para o 2º filtro).
  useEffect(() => {
    setFiltroSubgrupo('')
    if (!filtroGrupo) { setSubgrupos([]); return }
    createClient().from('subgrupos').select('id, nome')
      .eq('grupo_id', filtroGrupo).eq('status', 'ativo').order('nome')
      .then(({ data }) => setSubgrupos(data ?? []))
  }, [filtroGrupo])

  // Checklists visíveis conforme os filtros (grupo → subgrupo). Sem filtro = todos.
  const subgruposDoGrupo = new Set(subgrupos.map(s => s.id))
  const checklistsFiltrados = checklists.filter(c => {
    if (filtroSubgrupo) return c.subgrupo_id === filtroSubgrupo
    if (filtroGrupo) return c.subgrupo_id != null && subgruposDoGrupo.has(c.subgrupo_id)
    return true
  })

  // Se o checklist selecionado sair do filtro, limpa a seleção (evita salvar oculto).
  useEffect(() => {
    if (checklistId && !checklistsFiltrados.some(c => c.id === checklistId)) {
      setChecklistId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroGrupo, filtroSubgrupo, subgrupos])

  // Ao escolher um checklist, pré-preenche o prompt com seções/atividades dele.
  async function aoTrocarChecklist(id: string) {
    setChecklistId(id)
    if (!id || promptTocado.current) return
    const sb = createClient()
    const [{ data: secoes }, { data: atividades }] = await Promise.all([
      sb.from('checklist_secoes').select('id, nome, ordem').eq('checklist_id', id).order('ordem'),
      sb.from('checklist_atividades').select('id, nome, tipo, secao_id, ordem').eq('checklist_id', id).order('ordem'),
    ])
    const cl = checklists.find(c => c.id === id)
    const porSecao = new Map<string, SecaoEstrutura>()
    for (const s of secoes ?? []) porSecao.set(s.id, { nome: s.nome, atividades: [] })
    const semSecao: SecaoEstrutura = { nome: 'Sem seção', atividades: [] }
    for (const a of atividades ?? []) {
      const alvo = a.secao_id ? porSecao.get(a.secao_id) : semSecao
      ;(alvo ?? semSecao).atividades.push({ nome: a.nome, tipo: a.tipo })
    }
    const lista = [...porSecao.values()]
    if (semSecao.atividades.length) lista.push(semSecao)
    setPrompt(montarPromptModelo(cl?.nome ?? 'Checklist', lista))
  }

  function regerarPrompt() {
    promptTocado.current = false
    aoTrocarChecklist(checklistId)
  }

  async function salvar() {
    if (!nome.trim()) { toast.error('Dê um nome ao modelo.'); return }
    if (!checklistId) { toast.error('Escolha um checklist.'); return }
    if (periodoHoras < 1 || periodoHoras > 24) { toast.error('O período deve ser entre 1 e 24 horas.'); return }
    setSalvando(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()

    const payload = {
      unidade_id: unidadeId,
      checklist_id: checklistId,
      nome: nome.trim(),
      periodo_horas: periodoHoras,
      prompt: prompt.trim(),
      atualizado_em: new Date().toISOString(),
    }

    const { error } = edicao
      ? await sb.from('relatorio_modelos').update(payload).eq('id', modelo!.id)
      : await sb.from('relatorio_modelos').insert({ ...payload, criado_por: user?.id ?? null })

    setSalvando(false)
    if (error) {
      toast.error(edicao ? 'Não foi possível salvar.' : 'Não foi possível criar o modelo.')
      return
    }
    toast.success(edicao ? 'Modelo atualizado.' : 'Modelo criado.')
    onSalvo()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">{edicao ? 'Editar modelo' : 'Novo modelo de relatório'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do modelo</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Resumo da abertura"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>

          {/* Filtros opcionais para achar o checklist */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{grupoLabel}</label>
              <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Todos</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.display_name || g.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{subgrupoLabel}</label>
              <select value={filtroSubgrupo} onChange={e => setFiltroSubgrupo(e.target.value)} disabled={!filtroGrupo}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50">
                <option value="">Todos</option>
                {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Checklist</label>
            <select value={checklistId} onChange={e => aoTrocarChecklist(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Selecione…</option>
              {checklistsFiltrados.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {checklistsFiltrados.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Nenhum checklist publicado neste filtro.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Período (últimas horas)</label>
            <input type="number" min={1} max={24} value={periodoHoras}
              onChange={e => setPeriodoHoras(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
              className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            <span className="text-xs text-gray-400 ml-2">entre 1 e 24 horas</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Instruções para a IA</label>
              {checklistId && (
                <button type="button" onClick={regerarPrompt}
                  className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600">
                  <Sparkles size={12} />Refazer a partir do checklist
                </button>
              )}
            </div>
            <textarea value={prompt} onChange={e => { promptTocado.current = true; setPrompt(e.target.value) }}
              rows={8} placeholder="Escolha um checklist para gerar um modelo de instruções…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-y font-mono text-xs leading-relaxed" />
            <p className="text-xs text-gray-400 mt-1">O texto vem preenchido com os itens do checklist — ajuste como quiser.</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : edicao ? 'Salvar' : 'Criar modelo'}</Button>
        </div>
      </div>
    </div>
  )
}
