'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronLeft, Save, Send, GripVertical, Trash2, ChevronDown, ChevronUp, Settings } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
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
  config: Record<string, any>
  atividade_pai_id: string | null
  valor_gatilho: string | null
  dependentes?: Atividade[]
}

interface Props {
  checklistId: string | null
}

const TIPO_ICONS: Record<string, string> = {
  sim_nao: '✅', numero: '🔢', texto: '📝', multipla_escolha: '☑️',
  catalogo: '📋', foto: '📷', assinatura: '✍️', data_hora: '🗓️', localizacao: '📍'
}

const TIPO_LABELS: Record<string, string> = {
  sim_nao: 'Sim/Não', numero: 'Número', texto: 'Texto', multipla_escolha: 'Múltipla escolha',
  catalogo: 'Catálogo', foto: 'Foto', assinatura: 'Assinatura', data_hora: 'Data/Hora', localizacao: 'Localização'
}

export default function ChecklistMontador({ checklistId }: Props) {
  const router = useRouter()
  const { unidadeAtiva, subgrupoLabel } = useSession()

  // Dados do checklist
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [subgrupoId, setSubgrupoId] = useState('')
  const [subgrupos, setSubgrupos] = useState<{ id: string; nome: string }[]>([])
  const [status, setStatus] = useState<'rascunho' | 'publicado'>('rascunho')
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [salvando, setSalvando] = useState(false)
  const [id, setId] = useState<string | null>(checklistId)

  // Modal de atividade
  const [atividadeModal, setAtividadeModal] = useState<{
    secaoId: string
    atividade?: Atividade
    paiId?: string
    valorGatilho?: string
  } | null>(null)

  useEffect(() => {
    if (!unidadeAtiva?.id) return
    createClient().from('subgrupos').select('id, nome')
      .eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })

    if (checklistId) carregarChecklist(checklistId)
  }, [unidadeAtiva?.id, checklistId])

  async function carregarChecklist(clId: string) {
    const supabase = createClient()
    const { data: cl } = await supabase.from('checklists').select('*').eq('id', clId).single()
    if (!cl) return
    setNome(cl.nome)
    setDescricao(cl.descricao ?? '')
    setSubgrupoId(cl.subgrupo_id ?? '')
    setStatus(cl.status)

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
  }

  async function salvar() {
    if (!nome.trim() || !unidadeAtiva?.id) return
    setSalvando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (id) {
      await supabase.from('checklists').update({
        nome, descricao: descricao || null, subgrupo_id: subgrupoId || null, atualizado_em: new Date().toISOString()
      }).eq('id', id)
    } else {
      const { data } = await supabase.from('checklists').insert({
        nome, descricao: descricao || null, subgrupo_id: subgrupoId || null,
        unidade_id: unidadeAtiva.id, criado_por: user?.id, status: 'rascunho'
      }).select('id').single()
      if (data) {
        setId(data.id)
        router.replace(`/gestao/checklists/${data.id}/montar`)
      }
    }
    setSalvando(false)
  }

  async function publicar() {
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
    alert(`Publicado como v${novaVersao}!`)
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
    if (!confirm('Remover esta seção e todas as suas atividades?')) return
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
      const existe = s.atividades.find(a => a.id === atividade.id)
      if (existe) return { ...s, atividades: s.atividades.map(a => a.id === atividade.id ? { ...atividade, dependentes: a.dependentes } : a) }
      return { ...s, atividades: [...s.atividades, { ...atividade, dependentes: [] }] }
    }))
    setAtividadeModal(null)
  }

  async function deletarAtividade(atividadeId: string, secaoId: string) {
    if (!confirm('Remover esta atividade?')) return
    await createClient().from('checklist_atividades').delete().eq('id', atividadeId)
    setSecoes(prev => prev.map(s => s.id !== secaoId ? s : {
      ...s, atividades: s.atividades.filter(a => a.id !== atividadeId)
    }))
  }

  const totalAtividades = secoes.reduce((acc, s) => acc + s.atividades.length, 0)

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/gestao/checklists')}
            className="text-gray-400 hover:text-orange-500 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800">{id ? 'Editar checklist' : 'Novo checklist'}</h1>
            <p className="text-xs text-gray-400">{totalAtividades} atividades · {status === 'publicado' ? '✅ Publicado' : '📝 Rascunho'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={salvar} disabled={salvando}>
            <Save size={14} />{salvando ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button size="sm" onClick={publicar} disabled={!nome.trim()}>
            <Send size={14} />Publicar
          </Button>
        </div>
      </div>

      {/* Dados gerais */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do checklist</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Inspeção diária da linha A"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{subgrupoLabel}</label>
            <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Nenhum</option>
              {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Opcional"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>
        </div>
      </div>

      {/* Seções e atividades */}
      {!id && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-700">
          Salve o checklist primeiro para começar a adicionar seções e atividades.
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
                  onChange={e => renomearSecao(secao.id, e.target.value)}
                  className="flex-1 text-sm font-semibold bg-transparent border-none outline-none text-gray-700 focus:bg-white focus:px-2 focus:rounded transition-all"
                />
                <span className="text-xs text-gray-400">{secao.atividades.length} atividades</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => moverSecao(sIdx, -1)} disabled={sIdx === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => moverSecao(sIdx, 1)} disabled={sIdx === secoes.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                    <ChevronDown size={14} />
                  </button>
                  <button onClick={() => setSecoes(prev => prev.map(s => s.id === secao.id ? { ...s, expandida: !s.expandida } : s))}
                    className="p-1 text-gray-400 hover:text-orange-500">
                    {secao.expandida ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button onClick={() => deletarSecao(secao.id)} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Atividades da seção */}
              {secao.expandida && (
                <div className="divide-y divide-gray-50">
                  {secao.atividades.map((atv, aIdx) => (
                    <AtividadeRow
                      key={atv.id} atividade={atv} idx={aIdx} total={secao.atividades.length}
                      onMover={(dir) => moverAtividade(secao.id, aIdx, dir)}
                      onEditar={() => setAtividadeModal({ secaoId: secao.id, atividade: atv })}
                      onDeletar={() => deletarAtividade(atv.id, secao.id)}
                      onAdicionarDependente={(paiId, gatilho) => setAtividadeModal({ secaoId: secao.id, paiId, valorGatilho: gatilho })}
                    />
                  ))}

                  <div className="px-4 py-2">
                    <button
                      onClick={() => setAtividadeModal({ secaoId: secao.id })}
                      className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 font-medium py-1">
                      <Plus size={13} />Adicionar atividade
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <button onClick={adicionarSecao}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-orange-300 hover:text-orange-500 transition-colors">
            <Plus size={15} />Adicionar seção
          </button>
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

function AtividadeRow({ atividade, idx, total, onMover, onEditar, onDeletar, onAdicionarDependente }: {
  atividade: Atividade
  idx: number
  total: number
  onMover: (dir: -1 | 1) => void
  onEditar: () => void
  onDeletar: () => void
  onAdicionarDependente: (paiId: string, gatilho: string) => void
}) {
  const [expandido, setExpandido] = useState(false)
  const temDependentes = (atividade.dependentes?.length ?? 0) > 0
  const podeTerDependentes = ['sim_nao', 'multipla_escolha'].includes(atividade.tipo)

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
        <span className="text-sm mr-0.5">{TIPO_ICONS[atividade.tipo]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 truncate">{atividade.nome}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{TIPO_LABELS[atividade.tipo]}</span>
            {atividade.critica && <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">crítica</span>}
            {atividade.gera_plano_acao && <span className="text-xs bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded">plano de ação</span>}
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
          <button onClick={() => onMover(-1)} disabled={idx === 0} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30"><ChevronUp size={13} /></button>
          <button onClick={() => onMover(1)} disabled={idx === total - 1} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30"><ChevronDown size={13} /></button>
          <button onClick={onEditar} className="p-1 text-gray-400 hover:text-orange-500"><Settings size={13} /></button>
          <button onClick={onDeletar} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Atividades dependentes */}
      {expandido && podeTerDependentes && (
        <div className="ml-8 mt-2 space-y-1 border-l-2 border-blue-100 pl-3">
          {atividade.dependentes?.map(dep => (
            <div key={dep.id} className="flex items-center gap-2 py-1.5">
              <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">
                {dep.valor_gatilho === 'sim' ? 'SIM' : dep.valor_gatilho === 'nao' ? 'NÃO' : dep.valor_gatilho}
              </span>
              <span className="text-sm mr-0.5">{TIPO_ICONS[dep.tipo]}</span>
              <span className="text-sm text-gray-700 flex-1 truncate">{dep.nome}</span>
              <button className="p-1 text-gray-400 hover:text-orange-500"><Settings size={12} /></button>
              <button className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
            </div>
          ))}
          {/* Botões para adicionar dependentes */}
          {atividade.tipo === 'sim_nao' && (
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
        </div>
      )}

      {/* Botão para abrir dependentes se não expandido */}
      {!expandido && podeTerDependentes && !temDependentes && (
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
        </div>
      )}
    </div>
  )
}
