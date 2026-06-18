'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronLeft, Save, Send, GripVertical, Trash2, ChevronDown, ChevronUp, Settings, Type, Hash, ToggleLeft, List, BookOpen, Camera, PenLine, CalendarDays, MapPin, Video } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast, useConfirm } from '@/components/ui/feedback'
import AtividadeModal from './AtividadeModal'

interface Secao {
  id: string
  nome: string
  ordem: number
  expandida: boolean
  atividades: Atividade[]
}

interface Atividade {
  id: string
  secao_id: string | null
  nome: string
  descricao: string | null
  tipo: string
  ordem: number
  obrigatoria: boolean
  critica: boolean
  gera_plano_acao: boolean
  plano_acao_sla_horas: number | null
  config: Record<string, any>
  atividade_pai_id: string | null
  valor_gatilho: string | null
  dependentes?: Atividade[]
}

interface Props {
  checklistId: string | null
  /** Modo curadoria de modelo (template): sem unidade/grupo, com segmentos */
  modoTemplate?: boolean
  /** Base de rota para voltar/redirecionar (default: gestão) */
  baseRoute?: string
}

const TIPO_LABELS: Record<string, string> = {
  sim_nao: 'Sim/Não', numero: 'Número', texto: 'Texto', multipla_escolha: 'Múltipla escolha',
  catalogo: 'Catálogo', foto: 'Foto', video: 'Vídeo', assinatura: 'Assinatura', data_hora: 'Data/Hora', localizacao: 'Localização'
}

const TIPO_CONFIG: Record<string, { bg: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  texto:           { bg: 'bg-orange-400',  Icon: Type },
  numero:          { bg: 'bg-green-500',   Icon: Hash },
  sim_nao:         { bg: 'bg-emerald-500', Icon: ToggleLeft },
  multipla_escolha:{ bg: 'bg-blue-500',    Icon: List },
  catalogo:        { bg: 'bg-slate-500',   Icon: BookOpen },
  foto:            { bg: 'bg-rose-400',    Icon: Camera },
  video:           { bg: 'bg-pink-600',    Icon: Video },
  assinatura:      { bg: 'bg-purple-500',  Icon: PenLine },
  data_hora:       { bg: 'bg-sky-400',     Icon: CalendarDays },
  localizacao:     { bg: 'bg-amber-600',   Icon: MapPin },
}

function TipoIcon({ tipo, size = 'md' }: { tipo: string; size?: 'sm' | 'md' | 'lg' }) {
  const cfg = TIPO_CONFIG[tipo] ?? { bg: 'bg-gray-400', Icon: Type }
  const { bg, Icon } = cfg
  const dim = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9'
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18
  return (
    <div className={`${dim} ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
      <Icon size={iconSize} className="text-white" />
    </div>
  )
}

export default function ChecklistMontador({ checklistId, modoTemplate = false, baseRoute = '/gestao/checklists' }: Props) {
  const router = useRouter()
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const toast = useToast()
  const confirm = useConfirm()

  // Dados do checklist
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [segmentos, setSegmentos] = useState<string[]>([])
  const [grupoId, setGrupoId] = useState('')
  const [subgrupoId, setSubgrupoId] = useState('')
  const [grupos, setGrupos] = useState<{ id: string; nome: string }[]>([])
  const [subgrupos, setSubgrupos] = useState<{ id: string; nome: string }[]>([])
  const [motivos, setMotivos] = useState<{ id: string; descricao: string; tipo: string }[]>([])
  const [motivosSelecionados, setMotivosSelecionados] = useState<string[]>([])
  const [tempoGuarda, setTempoGuarda] = useState(1)
  // Modo de execução: true = pausável ("Continuar depois"); false = de uma vez
  const [permiteContinuar, setPermiteContinuar] = useState(true)
  const [status, setStatus] = useState<'rascunho' | 'publicado'>('rascunho')
  // Subgrupo a pré-selecionar ao criar pela área (vem de ?subgrupo= na URL),
  // aplicado depois que a lista de subgrupos do grupo carrega
  const subgrupoInicialRef = useRef<string | null>(null)
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [salvando, setSalvando] = useState(false)
  const [id, setId] = useState<string | null>(checklistId)
  // Guard: checklist publicado abre em modo somente-leitura — a estrutura
  // publicada não pode ser mutada sem o operador estar ciente de que as
  // mudanças valem imediatamente e exigem republicação (nova versão)
  const [edicaoLiberada, setEdicaoLiberada] = useState(false)
  const bloqueado = status === 'publicado' && !edicaoLiberada

  async function liberarEdicao() {
    const ok = await confirm({
      titulo: 'Liberar edição de checklist publicado?',
      mensagem: 'As alterações na estrutura passam a valer imediatamente na Operação. Ao terminar, clique em "Publicar" para registrar uma nova versão.',
      confirmarLabel: 'Liberar edição',
      perigo: true,
    })
    if (ok) setEdicaoLiberada(true)
  }

  // Modal de atividade
  const [atividadeModal, setAtividadeModal] = useState<{
    secaoId: string
    atividade?: Atividade
    paiId?: string
    valorGatilho?: string
  } | null>(null)

  // Carrega grupos da unidade
  useEffect(() => {
    if (modoTemplate) {
      // Curadoria de modelo: não depende de unidade/grupos
      if (checklistId) carregarChecklist(checklistId)
      return
    }
    if (!unidadeAtiva?.id) return
    createClient().from('grupos')
      .select('id, nome').eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setGrupos(data) })

    if (checklistId) carregarChecklist(checklistId)
  }, [unidadeAtiva?.id, checklistId, modoTemplate])

  // Novo checklist criado pela área: pré-seleciona grupo/subgrupo do caminho.
  // Deriva o grupo a partir do subgrupo informado em ?subgrupo=.
  useEffect(() => {
    if (checklistId) return // edição não pré-preenche
    const sub = new URLSearchParams(window.location.search).get('subgrupo')
    if (!sub) return
    subgrupoInicialRef.current = sub
    createClient().from('subgrupos').select('grupo_id').eq('id', sub).single()
      .then(({ data }) => { if (data?.grupo_id) setGrupoId(data.grupo_id) })
  }, [checklistId])

  // Carrega subgrupos quando grupo muda
  useEffect(() => {
    if (!grupoId) { setSubgrupos([]); setSubgrupoId(''); return }
    createClient().from('subgrupos')
      .select('id, nome').eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => {
        if (!data) return
        setSubgrupos(data)
        // Aplica o subgrupo pré-selecionado (criação pela área), se válido
        if (subgrupoInicialRef.current && data.some(s => s.id === subgrupoInicialRef.current)) {
          setSubgrupoId(subgrupoInicialRef.current)
          subgrupoInicialRef.current = null
        }
      })
  }, [grupoId])

  // Carrega motivos de não execução quando grupo ou subgrupo mudam
  useEffect(() => {
    if (!grupoId) { setMotivos([]); setMotivosSelecionados(prev => []); return }
    const supabase = createClient()
    let q = supabase.from('nao_execucao_motivos').select('id, descricao, tipo').eq('status', 'ativo')
    if (subgrupoId) {
      q = q.or(`subgrupo_id.eq.${subgrupoId},subgrupo_id.is.null`).eq('grupo_id', grupoId)
    } else {
      q = q.eq('grupo_id', grupoId)
    }
    q.order('tipo').order('descricao').then(({ data }) => { if (data) setMotivos(data) })
  }, [grupoId, subgrupoId])

  async function carregarChecklist(clId: string) {
    try {
    const supabase = createClient()
    const { data: cl, error: clErr } = await supabase.from('checklists').select('*').eq('id', clId).single()
    if (clErr || !cl) return
    setNome(cl.nome)
    setDescricao(cl.descricao ?? '')
    setSegmentos(cl.template_segmentos ?? [])
    setTempoGuarda(cl.tempo_guarda_meses ?? 1)
    setPermiteContinuar(cl.permite_continuar_depois ?? true)
    setStatus(cl.status)

    // Deriva grupoId do subgrupo salvo
    if (cl.subgrupo_id) {
      const { data: sub } = await supabase.from('subgrupos').select('grupo_id').eq('id', cl.subgrupo_id).single()
      if (sub?.grupo_id) setGrupoId(sub.grupo_id)
    }
    setSubgrupoId(cl.subgrupo_id ?? '')

    // Carrega motivos selecionados (tabela pode não existir ainda)
    try {
      const { data: motivosData } = await supabase
        .from('checklist_nao_execucao_motivos')
        .select('motivo_id')
        .eq('checklist_id', clId)
      if (motivosData) setMotivosSelecionados(motivosData.map((m: any) => m.motivo_id))
    } catch { /* tabela ainda não existe */ }

    const { data: secsData } = await supabase.from('checklist_secoes')
      .select('*').eq('checklist_id', clId).order('ordem')
    const { data: ativsData } = await supabase.from('checklist_atividades')
      .select('*').eq('checklist_id', clId).order('ordem')

    if (secsData && ativsData) {
      const atvsMap = ativsData.reduce((acc, a) => { acc[a.id] = { ...a, dependentes: [] }; return acc }, {} as any)
      // Organiza dependentes
      ativsData.forEach(a => {
        if (a.atividade_pai_id && atvsMap[a.atividade_pai_id]) {
          atvsMap[a.atividade_pai_id].dependentes.push(atvsMap[a.id])
        }
      })
      const atvsRaiz = ativsData.filter(a => !a.atividade_pai_id).map(a => atvsMap[a.id])

      setSecoes(secsData.map(s => ({
        ...s, expandida: true,
        atividades: atvsRaiz.filter(a => a.secao_id === s.id)
      })))
    }
    } catch (e) {
      console.error('Erro ao carregar checklist:', e)
    }
  }

  async function salvar() {
    if (!nome.trim()) return
    if (!modoTemplate && !unidadeAtiva?.id) return
    if (bloqueado) return // publicado em modo somente-leitura
    setSalvando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let checkId = id
    if (id) {
      await supabase.from('checklists').update({
        nome, descricao: descricao || null,
        subgrupo_id: modoTemplate ? null : (subgrupoId || null),
        ...(modoTemplate ? { template_segmentos: segmentos } : {}),
        tempo_guarda_meses: tempoGuarda, permite_continuar_depois: permiteContinuar,
        atualizado_em: new Date().toISOString()
      }).eq('id', id)
    } else {
      const { data } = await supabase.from('checklists').insert({
        nome, descricao: descricao || null,
        subgrupo_id: modoTemplate ? null : (subgrupoId || null),
        tempo_guarda_meses: tempoGuarda, permite_continuar_depois: permiteContinuar,
        unidade_id: modoTemplate ? null : unidadeAtiva!.id,
        is_template: modoTemplate, template_segmentos: modoTemplate ? segmentos : [],
        criado_por: user?.id, status: 'rascunho'
      }).select('id').single()
      if (data) {
        checkId = data.id
        setId(data.id)
        router.replace(`${baseRoute}/${data.id}/montar`)
      }
    }

    // Salva motivos selecionados
    if (checkId) {
      await supabase.from('checklist_nao_execucao_motivos').delete().eq('checklist_id', checkId)
      if (motivosSelecionados.length > 0) {
        await supabase.from('checklist_nao_execucao_motivos').insert(
          motivosSelecionados.map(motivo_id => ({ checklist_id: checkId, motivo_id }))
        )
      }
    }
    setSalvando(false)
  }

  async function publicar() {
    // Todo checklist (não-modelo) precisa estar associado a um subgrupo —
    // é o que define quem o vê na Operação.
    if (!modoTemplate && !subgrupoId) {
      toast.error(`Selecione um ${subgrupoLabel.toLowerCase()} antes de publicar — é ele que define quem vê o checklist na Operação.`)
      return
    }
    if (!id) { await salvar(); return }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: cl } = await supabase.from('checklists').select('versao_atual').eq('id', id).single()
    const novaVersao = (cl?.versao_atual ?? 0) + 1
    const snapshot = { nome, descricao, subgrupo_id: subgrupoId, secoes }

    await supabase.from('checklist_versoes').insert({
      checklist_id: id, numero_versao: novaVersao,
      snapshot, publicado_por: user?.id
    })
    await supabase.from('checklists').update({
      status: 'publicado', versao_atual: novaVersao, atualizado_em: new Date().toISOString()
    }).eq('id', id)
    setStatus('publicado')
    toast.success(`Checklist publicado como v${novaVersao}.`)
  }

  async function adicionarSecao() {
    if (!id) { await salvar(); return }
    const supabase = createClient()
    const ordem = secoes.length
    const { data } = await supabase.from('checklist_secoes').insert({
      checklist_id: id, nome: `Seção ${ordem + 1}`, ordem
    }).select('id, nome, ordem').single()
    if (data) setSecoes(prev => [...prev, { ...data, expandida: true, atividades: [] }])
  }

  async function renomearSecao(secaoId: string, novoNome: string) {
    const supabase = createClient()
    await supabase.from('checklist_secoes').update({ nome: novoNome }).eq('id', secaoId)
    setSecoes(prev => prev.map(s => s.id === secaoId ? { ...s, nome: novoNome } : s))
  }

  async function deletarSecao(secaoId: string) {
    if (!await confirm({ titulo: 'Remover esta seção?', mensagem: 'Todas as atividades dela serão removidas.', confirmarLabel: 'Remover', perigo: true })) return
    await createClient().from('checklist_secoes').delete().eq('id', secaoId)
    setSecoes(prev => prev.filter(s => s.id !== secaoId))
  }

  async function moverSecao(idx: number, dir: -1 | 1) {
    const novas = [...secoes]
    const alvo = idx + dir
    if (alvo < 0 || alvo >= novas.length) return;
    [novas[idx], novas[alvo]] = [novas[alvo], novas[idx]]
    novas.forEach((s, i) => s.ordem = i)
    setSecoes(novas)
    const supabase = createClient()
    await Promise.all(novas.map(s => supabase.from('checklist_secoes').update({ ordem: s.ordem }).eq('id', s.id)))
  }

  async function moverAtividade(secaoId: string, idx: number, dir: -1 | 1) {
    setSecoes(prev => prev.map(s => {
      if (s.id !== secaoId) return s
      const ativs = [...s.atividades]
      const alvo = idx + dir
      if (alvo < 0 || alvo >= ativs.length) return s;
      [ativs[idx], ativs[alvo]] = [ativs[alvo], ativs[idx]]
      ativs.forEach((a, i) => a.ordem = i)
      const supabase = createClient()
      Promise.all(ativs.map(a => supabase.from('checklist_atividades').update({ ordem: a.ordem }).eq('id', a.id)))
      return { ...s, atividades: ativs }
    }))
  }

  function onAtividadeSalva(atividade: Atividade) {
    setSecoes(prev => prev.map(s => {
      if (s.id !== atividade.secao_id) return s
      // Atividade dependente — aninha no pai
      if (atividade.atividade_pai_id) {
        return {
          ...s,
          atividades: s.atividades.map(a => {
            if (a.id !== atividade.atividade_pai_id) return a
            const depExiste = (a.dependentes ?? []).find(d => d.id === atividade.id)
            const novosDeps = depExiste
              ? (a.dependentes ?? []).map(d => d.id === atividade.id ? atividade : d)
              : [...(a.dependentes ?? []), atividade]
            return { ...a, dependentes: novosDeps }
          }),
        }
      }
      // Atividade raiz
      const existe = s.atividades.find(a => a.id === atividade.id)
      if (existe) return { ...s, atividades: s.atividades.map(a => a.id === atividade.id ? { ...atividade, dependentes: a.dependentes } : a) }
      return { ...s, atividades: [...s.atividades, { ...atividade, dependentes: [] }] }
    }))
    setAtividadeModal(null)
  }

  async function deletarAtividade(atividadeId: string, secaoId: string) {
    if (!await confirm({ titulo: 'Remover esta atividade?', confirmarLabel: 'Remover', perigo: true })) return
    await createClient().from('checklist_atividades').delete().eq('id', atividadeId)
    setSecoes(prev => prev.map(s => s.id !== secaoId ? s : {
      ...s, atividades: s.atividades.filter(a => a.id !== atividadeId)
    }))
  }

  async function deletarDependente(depId: string, paiId: string, secaoId: string) {
    if (!await confirm({ titulo: 'Remover esta atividade dependente?', confirmarLabel: 'Remover', perigo: true })) return
    await createClient().from('checklist_atividades').delete().eq('id', depId)
    setSecoes(prev => prev.map(s => s.id !== secaoId ? s : {
      ...s,
      atividades: s.atividades.map(a => a.id !== paiId ? a : {
        ...a, dependentes: (a.dependentes ?? []).filter(d => d.id !== depId)
      }),
    }))
  }

  const totalAtividades = secoes.reduce((acc, s) => acc + s.atividades.length, 0)

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push(baseRoute)}
            className="text-gray-400 hover:text-orange-500 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800">{id ? (modoTemplate ? 'Editar modelo' : 'Editar checklist') : (modoTemplate ? 'Novo modelo' : 'Novo checklist')}</h1>
            <p className="text-xs text-gray-400">{totalAtividades} atividades · {status === 'publicado' ? '✅ Publicado' : '📝 Rascunho'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {bloqueado ? (
            <Button variant="outline" size="sm" onClick={liberarEdicao}>
              ✏️ Liberar edição
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={salvar} disabled={salvando}>
                <Save size={14} />{salvando ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button size="sm" onClick={publicar} disabled={!nome.trim()}>
                <Send size={14} />Publicar
              </Button>
            </>
          )}
        </div>
      </div>


      {/* Dados gerais */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do checklist</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Inspeção diária da linha A"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        {modoTemplate ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Segmentos</label>
            <p className="text-xs text-gray-400 mb-1">Separe por vírgula (ex: oficina, automotivo). Usados para filtrar o modelo na galeria.</p>
            <input
              value={segmentos.join(', ')}
              onChange={e => setSegmentos(e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))}
              placeholder="oficina, automotivo"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{grupoLabel}</label>
              <select value={grupoId} onChange={e => { setGrupoId(e.target.value); setSubgrupoId('') }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Selecione</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{subgrupoLabel} <span className="text-red-400">*</span></label>
              <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)}
                disabled={!grupoId}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50">
                <option value="">Nenhum</option>
                {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Opcional"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tempo de guarda das mídias</label>
          <p className="text-xs text-gray-400 mb-2">Por quantos meses as <strong>mídias</strong> (fotos, vídeos, PDFs) das execuções ficam guardadas. Depois desse prazo, só as mídias são removidas para liberar espaço — o registro da execução é preservado. Quanto maior o prazo, maior o consumo da cota de armazenamento do seu plano.</p>
          <div className="flex flex-wrap gap-2">
            {[1, 3, 6, 12, 24, 36, 48, 60].map(m => (
              <button key={m} type="button" onClick={() => setTempoGuarda(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  tempoGuarda === m
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-500'
                }`}>
                {m} {m === 1 ? 'mês' : 'meses'}
              </button>
            ))}
          </div>
        </div>

        {/* Modo de execução */}
        <div className="border-t border-gray-100 pt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Modo de execução</label>
          <p className="text-xs text-gray-400 mb-2">Define se o operador pode pausar e retomar a execução depois.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => !bloqueado && setPermiteContinuar(true)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors ${
                permiteContinuar ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
              }`}>
              ⏸️ Pode continuar depois
              <span className="block text-[11px] font-normal opacity-70">Mostra &quot;Continuar depois&quot;; pendências aparecem na Operação</span>
            </button>
            <button type="button" onClick={() => !bloqueado && setPermiteContinuar(false)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors ${
                !permiteContinuar ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
              }`}>
              ▶️ Executar de uma vez
              <span className="block text-[11px] font-normal opacity-70">Sem atalhos para sair — conclui em uma sessão</span>
            </button>
          </div>
        </div>

        {/* Motivos de não execução */}
        {grupoId && motivos.length > 0 && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Motivos de não execução válidos
              <span className="text-gray-400 font-normal ml-1">(selecione os aplicáveis)</span>
            </label>
            {['checklist', 'atividade'].map(tipo => {
              const lista = motivos.filter(m => m.tipo === tipo)
              if (lista.length === 0) return null
              return (
                <div key={tipo}>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    {tipo === 'checklist' ? 'Não execução do checklist' : 'Não execução de atividade'}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {lista.map(m => (
                      <label key={m.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={motivosSelecionados.includes(m.id)}
                          onChange={e => setMotivosSelecionados(prev =>
                            e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id)
                          )}
                          className="accent-orange-500 flex-shrink-0"
                        />
                        {m.descricao}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {grupoId && motivos.length === 0 && (
          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            Nenhum motivo de não execução cadastrado para este {grupoLabel.toLowerCase()}/{subgrupoLabel.toLowerCase()}.
          </p>
        )}
      </div>

      {/* Seções e atividades */}
      {!id && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-700">
          Salve o checklist primeiro para começar a adicionar seções e atividades.
        </div>
      )}

      {id && bloqueado && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
          <span className="text-blue-500 text-base leading-none mt-0.5">🔒</span>
          <div>
            <p className="text-xs font-semibold text-blue-800">Checklist publicado — somente leitura</p>
            <p className="text-xs text-blue-600 mt-0.5">Para alterar, duplique este checklist (gera um rascunho) ou use "Liberar edição" e publique uma nova versão ao terminar.</p>
          </div>
        </div>
      )}

      {id && status === 'publicado' && !bloqueado && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
          <span className="text-amber-500 text-base leading-none mt-0.5">⚠️</span>
          <div>
            <p className="text-xs font-semibold text-amber-800">Edição liberada em checklist publicado</p>
            <p className="text-xs text-amber-700 mt-0.5">As mudanças já valem imediatamente na Operação. Clique em "Publicar" ao terminar para registrar a nova versão.</p>
          </div>
        </div>
      )}

      {id && (
        <div className="space-y-3">
          {secoes.map((secao, sIdx) => (
            <div key={secao.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header da seção */}
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <GripVertical size={16} className="text-gray-300 flex-shrink-0" />
                <input
                  value={secao.nome}
                  onChange={e => !bloqueado && renomearSecao(secao.id, e.target.value)}
                  readOnly={bloqueado}
                  className="flex-1 text-sm font-semibold bg-transparent border-none outline-none text-gray-700 focus:bg-white focus:px-2 focus:rounded transition-all read-only:cursor-default"
                />
                <span className="text-xs text-gray-400">{secao.atividades.length} atividades</span>
                <div className="flex items-center gap-1">
                  {!bloqueado && (
                    <>
                      <button onClick={() => moverSecao(sIdx, -1)} disabled={sIdx === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={() => moverSecao(sIdx, 1)} disabled={sIdx === secoes.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                        <ChevronDown size={14} />
                      </button>
                    </>
                  )}
                  <button onClick={() => setSecoes(prev => prev.map(s => s.id === secao.id ? { ...s, expandida: !s.expandida } : s))}
                    className="p-1 text-gray-400 hover:text-orange-500">
                    {secao.expandida ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {!bloqueado && (
                    <button onClick={() => deletarSecao(secao.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Atividades da seção */}
              {secao.expandida && (
                <div className="divide-y divide-gray-50">
                  {secao.atividades.map((atv, aIdx) => (
                    <AtividadeRow
                      key={atv.id} atividade={atv} idx={aIdx} total={secao.atividades.length}
                      readonly={bloqueado}
                      onMover={(dir) => moverAtividade(secao.id, aIdx, dir)}
                      onEditar={() => setAtividadeModal({ secaoId: secao.id, atividade: atv })}
                      onDeletar={() => deletarAtividade(atv.id, secao.id)}
                      onAdicionarDependente={(paiId, gatilho) => setAtividadeModal({ secaoId: secao.id, paiId, valorGatilho: gatilho })}
                      onEditarDependente={(dep) => setAtividadeModal({ secaoId: secao.id, atividade: dep })}
                      onDeletarDependente={(depId) => deletarDependente(depId, atv.id, secao.id)}
                    />
                  ))}

                  {!bloqueado && (
                    <div className="px-4 py-2">
                      <button
                        onClick={() => setAtividadeModal({ secaoId: secao.id })}
                        className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 font-medium py-1">
                        <Plus size={13} />Adicionar atividade
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {!bloqueado && (
            <button onClick={adicionarSecao}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-orange-300 hover:text-orange-500 transition-colors">
              <Plus size={15} />Adicionar seção
            </button>
          )}
        </div>
      )}

      {/* Modal de atividade */}
      {atividadeModal && id && (
        <AtividadeModal
          checklistId={id}
          secaoId={atividadeModal.secaoId}
          atividade={atividadeModal.atividade}
          paiId={atividadeModal.paiId}
          valorGatilho={atividadeModal.valorGatilho}
          ordemAtual={secoes.find(s => s.id === atividadeModal.secaoId)?.atividades.length ?? 0}
          onClose={() => setAtividadeModal(null)}
          onSalva={onAtividadeSalva}
        />
      )}
    </div>
  )
}

function AtividadeRow({ atividade, idx, total, readonly, onMover, onEditar, onDeletar, onAdicionarDependente, onEditarDependente, onDeletarDependente }: {
  atividade: Atividade
  idx: number
  total: number
  readonly?: boolean
  onMover: (dir: -1 | 1) => void
  onEditar: () => void
  onDeletar: () => void
  onAdicionarDependente: (paiId: string, gatilho: string) => void
  onEditarDependente: (dep: Atividade) => void
  onDeletarDependente: (depId: string) => void
}) {
  const [expandido, setExpandido] = useState(false)
  const [opcoesMC, setOpcoesMC] = useState<{ valor: string; label: string }[]>([])
  const temDependentes = (atividade.dependentes?.length ?? 0) > 0
  const podeTerDependentes = ['sim_nao', 'multipla_escolha'].includes(atividade.tipo)

  useEffect(() => {
    if (atividade.tipo !== 'multipla_escolha') return
    createClient()
      .from('checklist_atividade_opcoes')
      .select('valor, label')
      .eq('atividade_id', atividade.id)
      .order('ordem')
      .then(({ data }) => { if (data) setOpcoesMC(data) })
  }, [atividade.id, atividade.tipo])

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
        <TipoIcon tipo={atividade.tipo} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 truncate">{atividade.nome}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{TIPO_LABELS[atividade.tipo]}</span>
            {atividade.critica && <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">crítica</span>}
            {atividade.gera_plano_acao && (
              <span className="text-xs bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded">
                plano de ação{atividade.plano_acao_sla_horas ? ` · ${atividade.plano_acao_sla_horas}h` : ''}
              </span>
            )}
            {!atividade.obrigatoria && <span className="text-xs bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded">opcional</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {podeTerDependentes && temDependentes && (
            <button onClick={() => setExpandido(!expandido)}
              className="p-1 text-xs text-blue-400 hover:text-blue-600">
              {expandido ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span className="ml-0.5">{atividade.dependentes?.length}</span>
            </button>
          )}
          {!readonly && (
            <>
              <button onClick={() => onMover(-1)} disabled={idx === 0} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30"><ChevronUp size={13} /></button>
              <button onClick={() => onMover(1)} disabled={idx === total - 1} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30"><ChevronDown size={13} /></button>
              <button onClick={onEditar} className="p-1 text-gray-400 hover:text-orange-500"><Settings size={13} /></button>
              <button onClick={onDeletar} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>

      {/* Atividades dependentes */}
      {expandido && podeTerDependentes && (
        <div className="ml-6 mt-2 space-y-1 border-l-2 border-blue-100 pl-3">
          {atividade.dependentes?.map(dep => (
            <div key={dep.id} className="flex items-center gap-2 py-1.5 bg-blue-50/50 rounded-lg px-2">
              <span className="text-xs font-mono font-semibold text-blue-500 flex-shrink-0">↳</span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                dep.valor_gatilho === 'sim' ? 'bg-green-100 text-green-700' :
                dep.valor_gatilho === 'nao' ? 'bg-red-100 text-red-600' :
                'bg-blue-100 text-blue-700'
              }`}>
                {dep.valor_gatilho === 'sim' ? 'SIM' : dep.valor_gatilho === 'nao' ? 'NÃO' : dep.valor_gatilho}
              </span>
              <TipoIcon tipo={dep.tipo} size="sm" />
              <span className="text-sm text-gray-700 flex-1 truncate">{dep.nome}</span>
              <span className="text-xs text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">dependente</span>
              {!readonly && (
                <>
                  <button onClick={() => onEditarDependente(dep)} className="p-1 text-gray-400 hover:text-orange-500"><Settings size={12} /></button>
                  <button onClick={() => onDeletarDependente(dep.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                </>
              )}
            </div>
          ))}
          {/* Botões para adicionar dependentes */}
          {!readonly && atividade.tipo === 'sim_nao' && (
            <div className="flex gap-2 mt-1">
              <button onClick={() => onAdicionarDependente(atividade.id, 'sim')}
                className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1">
                <Plus size={11} />Se SIM
              </button>
              <button onClick={() => onAdicionarDependente(atividade.id, 'nao')}
                className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                <Plus size={11} />Se NÃO
              </button>
            </div>
          )}
          {!readonly && atividade.tipo === 'multipla_escolha' && opcoesMC.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {opcoesMC.map(op => (
                <button key={op.valor} onClick={() => onAdicionarDependente(atividade.id, op.valor)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 border border-blue-200 bg-blue-50 px-2 py-0.5 rounded-full">
                  <Plus size={11} />Se "{op.label}"
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Botão para abrir dependentes se não expandido */}
      {!readonly && !expandido && podeTerDependentes && !temDependentes && (
        <div className="ml-8 mt-1">
          {atividade.tipo === 'sim_nao' && (
            <div className="flex gap-2">
              <button onClick={() => onAdicionarDependente(atividade.id, 'sim')}
                className="text-xs text-gray-400 hover:text-green-600 flex items-center gap-1">
                <Plus size={11} />Se SIM
              </button>
              <button onClick={() => onAdicionarDependente(atividade.id, 'nao')}
                className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                <Plus size={11} />Se NÃO
              </button>
            </div>
          )}
          {atividade.tipo === 'multipla_escolha' && opcoesMC.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {opcoesMC.map(op => (
                <button key={op.valor} onClick={() => onAdicionarDependente(atividade.id, op.valor)}
                  className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1">
                  <Plus size={11} />Se "{op.label}"
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
