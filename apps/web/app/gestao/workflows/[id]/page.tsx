'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Plus, Trash2, GripVertical, ChevronDown,
  Search, CheckSquare, X, Loader2, GitBranch, AlertCircle, Check
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { ONBOARDING_WORKFLOWS } from '@/components/onboarding/configs'
import { useToast } from '@/components/ui/feedback'

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface ItemLocal {
  localId:       string
  checklistId:   string
  checklistNome: string
  subgrupoId:    string | null
  subgrupoNome:  string | null
  obrigatorio:   boolean
}

interface EstagioLocal {
  localId:        string
  dbId:           string | null  // null = ainda não salvo no banco
  nome:           string
  ordem:          number
  condicaoAvanco: 'todos_aprovados' | 'todos_concluidos' | 'qualquer_aprovado'
  itens:          ItemLocal[]
}

const CONDICAO_OPTS = [
  { value: 'todos_aprovados',  label: 'Todos aprovados',   desc: 'Todos os checklists precisam ser concluídos sem reprovação' },
  { value: 'todos_concluidos', label: 'Todos concluídos',  desc: 'Todos os checklists precisam ser finalizados (independente do resultado)' },
  { value: 'qualquer_aprovado',label: 'Qualquer aprovado', desc: 'Basta um checklist ser aprovado para avançar' },
]

function uid() { return Math.random().toString(36).slice(2) }

// ─── Modal seletor de checklist ───────────────────────────────────────────────

interface ChecklistDisponivel {
  id: string
  nome: string
  subgrupo_id: string | null
  subgrupo_nome: string | null
}

interface Subgrupo { id: string; nome: string; grupo_id: string }
interface Grupo { id: string; nome: string }

function PickerModal({
  unidadeId,
  onConfirm,
  onClose,
}: {
  unidadeId: string
  onConfirm: (item: Omit<ItemLocal, 'localId'>) => void
  onClose: () => void
}) {
  const [checklists, setChecklists]   = useState<ChecklistDisponivel[]>([])
  const [grupos, setGrupos]           = useState<Grupo[]>([])
  const [subgrupos, setSubgrupos]     = useState<Subgrupo[]>([])
  const [busca, setBusca]             = useState('')
  const [selecionado, setSelecionado] = useState<ChecklistDisponivel | null>(null)
  const [grupoId, setGrupoId]         = useState<string>('')
  const [subgrupoId, setSubgrupoId]   = useState<string>('')
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('checklists')
        .select('id, nome, subgrupo_id, subgrupo:subgrupo_id(nome)')
        .eq('unidade_id', unidadeId)
        .eq('status', 'publicado')
        .order('nome'),
      sb.from('grupos')
        .select('id, nome')
        .eq('unidade_id', unidadeId)
        .eq('status', 'ativo')
        .order('nome'),
      sb.from('subgrupos')
        .select('id, nome, grupo_id, grupo:grupo_id(unidade_id)')
        .eq('status', 'ativo')
        .order('nome'),
      sb.auth.getUser(),
    ]).then(async ([clRes, grRes, sgRes, userRes]) => {
      const cls = (clRes.data ?? []).map((c: any) => {
        const sg = Array.isArray(c.subgrupo) ? c.subgrupo[0] : c.subgrupo
        return { id: c.id, nome: c.nome, subgrupo_id: sg?.id ?? null, subgrupo_nome: sg?.nome ?? null }
      })
      const sgs = (sgRes.data ?? [])
        .map((s: any) => {
          const gr = Array.isArray(s.grupo) ? s.grupo[0] : s.grupo
          return { id: s.id, nome: s.nome, grupo_id: s.grupo_id, _unidade_id: gr?.unidade_id }
        })
        .filter((s: any) => s._unidade_id === unidadeId)
        .map(({ _unidade_id, ...s }: any) => s)

      setChecklists(cls)
      setGrupos(grRes.data ?? [])
      setSubgrupos(sgs)
      setLoading(false)

      // Pré-seleciona o grupo/subgrupo atual do usuário (primeiro vínculo encontrado nesta unidade)
      const userId = userRes?.data?.user?.id
      if (userId) {
        const { data: meu } = await sb
          .from('usuario_subgrupo')
          .select('subgrupo_id, subgrupo:subgrupo_id(id, grupo_id, grupo:grupo_id(unidade_id))')
          .eq('usuario_id', userId)
        const meuNaUnidade = (meu ?? []).find((m: any) => {
          const sg = Array.isArray(m.subgrupo) ? m.subgrupo[0] : m.subgrupo
          const gr = sg ? (Array.isArray(sg.grupo) ? sg.grupo[0] : sg.grupo) : null
          return gr?.unidade_id === unidadeId
        })
        if (meuNaUnidade) {
          const sg = Array.isArray(meuNaUnidade.subgrupo) ? meuNaUnidade.subgrupo[0] : meuNaUnidade.subgrupo
          if (sg) {
            setGrupoId(sg.grupo_id)
            setSubgrupoId(sg.id)
          }
        }
      }
    })
  }, [unidadeId])

  // Quando seleciona um checklist, pré-preenche o subgrupo dele (e o grupo correspondente)
  function selecionar(cl: ChecklistDisponivel) {
    setSelecionado(cl)
    if (cl.subgrupo_id) {
      const sg = subgrupos.find(s => s.id === cl.subgrupo_id)
      if (sg) {
        setGrupoId(sg.grupo_id)
        setSubgrupoId(sg.id)
        return
      }
    }
    setSubgrupoId(cl.subgrupo_id ?? '')
  }

  const subgruposDoGrupo = subgrupos.filter(s => s.grupo_id === grupoId)

  function confirmar() {
    if (!selecionado) return
    const sg = subgrupos.find(s => s.id === subgrupoId)
    onConfirm({
      checklistId:   selecionado.id,
      checklistNome: selecionado.nome,
      subgrupoId:    subgrupoId || null,
      subgrupoNome:  sg?.nome ?? null,
      obrigatorio:   true,
    })
  }

  const filtrados = checklists.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-800">
            {selecionado ? 'Definir executor' : 'Adicionar checklist'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
            <X size={16} />
          </button>
        </div>

        {!selecionado ? (
          <>
            {/* Busca e lista de checklists */}
            <div className="px-4 pt-3 pb-2 flex-shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar checklist..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
              {loading ? (
                <div className="py-8 text-center text-xs text-gray-400">Carregando...</div>
              ) : filtrados.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">Nenhum checklist publicado encontrado.</div>
              ) : filtrados.map(cl => (
                <button key={cl.id} onClick={() => selecionar(cl)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-violet-200 hover:bg-violet-50 transition-colors">
                  <CheckSquare size={15} className="text-violet-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{cl.nome}</p>
                    {cl.subgrupo_nome && (
                      <p className="text-xs text-gray-400">{cl.subgrupo_nome}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Seleção de subgrupo */}
            <div className="px-5 py-5 flex-1 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-xl">
                <CheckSquare size={16} className="text-violet-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{selecionado.nome}</p>
                  {selecionado.subgrupo_nome && (
                    <p className="text-xs text-gray-500">Subgrupo padrão: {selecionado.subgrupo_nome}</p>
                  )}
                </div>
                <button onClick={() => setSelecionado(null)} className="ml-auto p-1 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Grupo
                </label>
                <div className="relative">
                  <select value={grupoId} onChange={e => { setGrupoId(e.target.value); setSubgrupoId('') }}
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white pr-8">
                    <option value="">Selecione um grupo</option>
                    {grupos.map(g => (
                      <option key={g.id} value={g.id}>{g.nome}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Quem executa este checklist neste estágio? (subgrupo)
                </label>
                <div className="relative">
                  <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)} disabled={!grupoId}
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white pr-8 disabled:opacity-50">
                    <option value="">Sem subgrupo específico</option>
                    {subgruposDoGrupo.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Define qual área/equipe verá este checklist na tela de operações. Por padrão, vem marcado o grupo e subgrupo atuais do criador — você pode trocar para qualquer outro da unidade.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setSelecionado(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Voltar
              </button>
              <button onClick={confirmar}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors">
                <Check size={14} />
                Adicionar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isNovo = id === 'novo'
  const router = useRouter()
  const { empresaAtiva, unidadeAtiva } = useSession()
  const toast = useToast()

  const [nome, setNome]           = useState('')
  const [descricao, setDescricao] = useState('')
  const [status, setStatus]       = useState<'rascunho'|'publicado'>('rascunho')
  const [estagios, setEstagios]   = useState<EstagioLocal[]>([
    { localId: uid(), dbId: null, nome: 'Estágio 1', ordem: 1, condicaoAvanco: 'todos_aprovados', itens: [] }
  ])

  const [salvando, setSalvando]         = useState(false)
  const [loading, setLoading]           = useState(!isNovo)
  const [erro, setErro]                 = useState('')
  const [picker, setPicker]             = useState<string | null>(null) // localId do estágio
  const [menuEstagio, setMenuEstagio]   = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fecha menu ao clicar fora
  useEffect(() => {
    function h(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuEstagio(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Carrega workflow existente
  const carregar = useCallback(async () => {
    if (isNovo) return
    const sb = createClient()
    const { data: wf } = await sb.from('workflows').select('*').eq('id', id).single()
    if (!wf) { setLoading(false); return }
    setNome(wf.nome)
    setDescricao(wf.descricao ?? '')
    setStatus(wf.status)

    const { data: ests } = await sb.from('workflow_estagios')
      .select('*').eq('workflow_id', id).order('ordem')
    if (!ests?.length) { setLoading(false); return }

    const { data: itens } = await sb.from('workflow_estagio_itens')
      .select('*, checklist:checklist_id(nome), subgrupo:subgrupo_id(nome)')
      .in('estagio_id', ests.map(e => e.id))

    const itensMap: Record<string, ItemLocal[]> = {}
    for (const it of (itens ?? [])) {
      const cl = Array.isArray(it.checklist) ? it.checklist[0] : it.checklist
      const sg = Array.isArray(it.subgrupo) ? it.subgrupo[0] : it.subgrupo
      const item: ItemLocal = {
        localId:       it.id,
        checklistId:   it.checklist_id,
        checklistNome: cl?.nome ?? '—',
        subgrupoId:    it.subgrupo_id,
        subgrupoNome:  sg?.nome ?? null,
        obrigatorio:   it.obrigatorio,
      }
      if (!itensMap[it.estagio_id]) itensMap[it.estagio_id] = []
      itensMap[it.estagio_id].push(item)
    }

    setEstagios(ests.map(e => ({
      localId:        e.id,
      dbId:           e.id,
      nome:           e.nome,
      ordem:          e.ordem,
      condicaoAvanco: e.condicao_avanco,
      itens:          itensMap[e.id] ?? [],
    })))
    setLoading(false)
  }, [id, isNovo])

  useEffect(() => { carregar() }, [carregar])

  // ── Manipulação de estágios ──────────────────────────────────

  function addEstagio() {
    setEstagios(prev => [...prev, {
      localId:        uid(),
      dbId:           null,
      nome:           `Estágio ${prev.length + 1}`,
      ordem:          prev.length + 1,
      condicaoAvanco: 'todos_aprovados',
      itens:          [],
    }])
  }

  function removeEstagio(localId: string) {
    setEstagios(prev => prev.filter(e => e.localId !== localId))
  }

  function moveEstagio(localId: string, dir: -1 | 1) {
    setEstagios(prev => {
      const idx = prev.findIndex(e => e.localId === localId)
      if (idx + dir < 0 || idx + dir >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[idx + dir]] = [next[idx + dir], next[idx]]
      return next.map((e, i) => ({ ...e, ordem: i + 1 }))
    })
  }

  function updateEstagio(localId: string, patch: Partial<EstagioLocal>) {
    setEstagios(prev => prev.map(e => e.localId === localId ? { ...e, ...patch } : e))
  }

  function addItem(estagioLocalId: string, item: Omit<ItemLocal, 'localId'>) {
    setEstagios(prev => prev.map(e =>
      e.localId === estagioLocalId
        ? { ...e, itens: [...e.itens, { ...item, localId: uid() }] }
        : e
    ))
    setPicker(null)
  }

  function removeItem(estagioLocalId: string, itemLocalId: string) {
    setEstagios(prev => prev.map(e =>
      e.localId === estagioLocalId
        ? { ...e, itens: e.itens.filter(i => i.localId !== itemLocalId) }
        : e
    ))
  }

  // ── Salvar ────────────────────────────────────────────────────

  async function salvar(novoStatus?: 'rascunho' | 'publicado') {
    if (!nome.trim()) { setErro('Informe o nome do workflow.'); return }
    if (estagios.length === 0) { setErro('Adicione pelo menos um estágio.'); return }
    if (estagios.some(e => e.itens.length === 0)) {
      setErro('Todos os estágios precisam ter pelo menos um checklist.')
      return
    }
    setSalvando(true)
    setErro('')
    const sb = createClient()
    const statusFinal = novoStatus ?? status

    try {
      let workflowId = isNovo ? null : id

      if (isNovo) {
        const { data: { user } } = await sb.auth.getUser()
        const { data: wf, error } = await sb.from('workflows').insert({
          empresa_id: empresaAtiva!.id,
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          status: statusFinal,
          criado_por: user?.id,
        }).select('id').single()
        if (error || !wf) throw new Error('Erro ao criar workflow.')
        workflowId = wf.id
      } else {
        const { error } = await sb.from('workflows').update({
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          status: statusFinal,
          atualizado_em: new Date().toISOString(),
        }).eq('id', workflowId!)
        if (error) throw new Error('Erro ao atualizar workflow.')

        // Remove estágios antigos (cascade remove itens)
        await sb.from('workflow_estagios').delete().eq('workflow_id', workflowId!)
      }

      // Insere estágios e itens
      for (const est of estagios) {
        const { data: dbEst, error: errEst } = await sb.from('workflow_estagios').insert({
          workflow_id:     workflowId,
          nome:            est.nome,
          ordem:           est.ordem,
          condicao_avanco: est.condicaoAvanco,
        }).select('id').single()
        if (errEst || !dbEst) throw new Error('Erro ao salvar estágio.')

        if (est.itens.length > 0) {
          const { error: errItens } = await sb.from('workflow_estagio_itens').insert(
            est.itens.map(it => ({
              estagio_id:   dbEst.id,
              checklist_id: it.checklistId,
              subgrupo_id:  it.subgrupoId,
              obrigatorio:  it.obrigatorio,
            }))
          )
          if (errItens) throw new Error('Erro ao salvar itens do estágio.')
        }
      }

      router.push('/gestao/workflows')
    } catch (e: any) {
      setErro(e.message ?? 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 size={28} className="animate-spin text-violet-400" />
    </div>
  )

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={36} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Nenhuma empresa selecionada.</p>
    </div>
  )

  const condicaoLabel = (c: string) => CONDICAO_OPTS.find(o => o.value === c)?.label ?? c

  return (
    <div className="max-w-3xl mx-auto" ref={menuRef}>
      <Onboarding pageId="workflows" titulo="Workflows" cards={ONBOARDING_WORKFLOWS} />
      {/* Topo */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/gestao/workflows')}
          className="p-1.5 text-gray-400 hover:text-violet-500 rounded-lg hover:bg-violet-50 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Nome do workflow"
            className="text-xl font-semibold text-gray-800 bg-transparent border-0 outline-none w-full placeholder:text-gray-300 focus:ring-0"
          />
          <input
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Descrição (opcional)"
            className="text-xs text-gray-400 bg-transparent border-0 outline-none w-full mt-0.5 placeholder:text-gray-300 focus:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => salvar('rascunho')} disabled={salvando}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            Salvar rascunho
          </button>
          <button onClick={() => salvar('publicado')} disabled={salvando}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors disabled:opacity-50">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Publicar
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{erro}</p>
        </div>
      )}

      {/* Estágios */}
      <div className="space-y-1">
        {estagios.map((est, idx) => (
          <div key={est.localId}>
            {/* Card do estágio */}
            <div className="bg-white border border-gray-200 rounded-2xl">
              {/* Header do estágio */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveEstagio(est.localId, -1)} disabled={idx === 0}
                    className="text-gray-300 hover:text-gray-500 disabled:opacity-30 leading-none">
                    ▲
                  </button>
                  <button onClick={() => moveEstagio(est.localId, 1)} disabled={idx === estagios.length - 1}
                    className="text-gray-300 hover:text-gray-500 disabled:opacity-30 leading-none">
                    ▼
                  </button>
                </div>

                <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>

                <input
                  value={est.nome}
                  onChange={e => updateEstagio(est.localId, { nome: e.target.value })}
                  className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-0 outline-none focus:ring-0"
                />

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Avançar:</span>
                  <div className="relative">
                    <button
                      onClick={() => setMenuEstagio(menuEstagio === est.localId ? null : est.localId)}
                      className="flex items-center gap-1 text-xs text-violet-600 font-medium hover:text-violet-800 transition-colors"
                    >
                      {condicaoLabel(est.condicaoAvanco)}
                      <ChevronDown size={12} />
                    </button>
                    {menuEstagio === est.localId && (
                      <div className="absolute right-0 top-6 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-64">
                        {CONDICAO_OPTS.map(opt => (
                          <button key={opt.value}
                            onClick={() => { updateEstagio(est.localId, { condicaoAvanco: opt.value as any }); setMenuEstagio(null) }}
                            className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors ${est.condicaoAvanco === opt.value ? 'bg-violet-50' : ''}`}>
                            <p className={`text-sm font-medium ${est.condicaoAvanco === opt.value ? 'text-violet-600' : 'text-gray-700'}`}>
                              {opt.label}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {estagios.length > 1 && (
                  <button onClick={() => removeEstagio(est.localId)}
                    className="p-1.5 text-gray-300 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Itens do estágio */}
              <div className="px-4 py-3">
                {est.itens.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">
                    Nenhum checklist neste estágio. Checklists no mesmo estágio são executados em paralelo.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {est.itens.map(item => (
                      <div key={item.localId}
                        className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                        <CheckSquare size={13} className="text-violet-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate max-w-[140px]">{item.checklistNome}</p>
                          {item.subgrupoNome && (
                            <p className="text-[10px] text-violet-500">{item.subgrupoNome}</p>
                          )}
                        </div>
                        <button onClick={() => removeItem(est.localId, item.localId)}
                          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => unidadeAtiva ? setPicker(est.localId) : toast.info('Selecione uma unidade para ver os checklists.')}
                  className="flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors">
                  <Plus size={13} />
                  Adicionar checklist
                </button>
              </div>
            </div>

            {/* Seta entre estágios */}
            {idx < estagios.length - 1 && (
              <div className="flex items-center justify-center py-1.5 gap-2">
                <div className="h-px w-12 bg-gray-200" />
                <span className="text-[10px] text-gray-400 font-medium px-2 py-0.5 bg-gray-100 rounded-full whitespace-nowrap">
                  ↓ {condicaoLabel(est.condicaoAvanco)}
                </span>
                <div className="h-px w-12 bg-gray-200" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Botão novo estágio */}
      <button onClick={addEstagio}
        className="mt-3 w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-violet-300 hover:text-violet-500 flex items-center justify-center gap-2 transition-colors">
        <Plus size={16} />
        Novo estágio
      </button>

      {/* Modal picker */}
      {picker && unidadeAtiva && (
        <PickerModal
          unidadeId={unidadeAtiva.id}
          onConfirm={item => addItem(picker, item)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
