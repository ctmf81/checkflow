'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast } from '@/components/ui/feedback'

interface CausaRaiz {
  id: string
  nome: string
  observacoes: string | null
  grupo_id: string | null
  subgrupo_id: string | null
  checklist_id: string | null
  atividade_id: string | null
  documento_id: string | null
}

interface Grupo    { id: string; nome: string; display_name: string | null }
interface Subgrupo { id: string; nome: string }
interface Checklist { id: string; nome: string }
interface Atividade { id: string; nome: string; tipo: string }
interface Documento { id: string; nome: string; tipo: string }

interface Props {
  causa?: CausaRaiz
  onClose: () => void
  onSalvo?: () => void
}

export function CausaRaizModal({ causa, onClose, onSalvo }: Props) {
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const toast = useToast()
  const isEdicao = !!causa

  const [nome, setNome] = useState(causa?.nome ?? '')
  const [observacoes, setObservacoes] = useState(causa?.observacoes ?? '')
  const [grupoId, setGrupoId] = useState(causa?.grupo_id ?? '')
  const [subgrupoId, setSubgrupoId] = useState(causa?.subgrupo_id ?? '')
  const [checklistId, setChecklistId] = useState(causa?.checklist_id ?? '')
  const [atividadeId, setAtividadeId] = useState(causa?.atividade_id ?? '')
  const [documentoId, setDocumentoId] = useState(causa?.documento_id ?? '')

  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [documentos, setDocumentos] = useState<Documento[]>([])

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const setor = grupoLabel.toLowerCase().replace(/s$/, '')
  const area = subgrupoLabel.toLowerCase().replace(/s$/, '')

  // Carrega grupos da unidade
  useEffect(() => {
    if (!unidadeAtiva?.id) return
    createClient().from('grupos').select('id, nome, display_name')
      .eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setGrupos(data) })
  }, [unidadeAtiva?.id])

  // Subgrupos do grupo (load-only; reset é feito nos onChange p/ não apagar na edição)
  useEffect(() => {
    if (!grupoId) { setSubgrupos([]); return }
    createClient().from('subgrupos').select('id, nome')
      .eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })
  }, [grupoId])

  // Checklists do subgrupo (rascunho/publicado) + documentos POP/IT do recorte
  useEffect(() => {
    if (!subgrupoId) { setChecklists([]); setDocumentos([]); return }
    const supabase = createClient()
    supabase.from('checklists').select('id, nome')
      .eq('subgrupo_id', subgrupoId).in('status', ['rascunho', 'publicado']).order('nome')
      .then(({ data }) => { if (data) setChecklists(data) })
    supabase.from('documentos').select('id, nome, tipo')
      .eq('grupo_id', grupoId).eq('subgrupo_id', subgrupoId).eq('status', 'ativo')
      .in('tipo', ['pop', 'it']).order('nome')
      .then(({ data }) => { if (data) setDocumentos(data) })
  }, [subgrupoId])

  // Atividades (campos) do checklist
  useEffect(() => {
    if (!checklistId) { setAtividades([]); return }
    createClient().from('checklist_atividades').select('id, nome, tipo')
      .eq('checklist_id', checklistId).order('ordem')
      .then(({ data }) => { if (data) setAtividades(data) })
  }, [checklistId])

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome da causa raiz.'); return }
    if (!grupoId) { setErro(`Selecione o ${setor}.`); return }
    if (!subgrupoId) { setErro(`Selecione a ${area}.`); return }
    if (!checklistId) { setErro('Selecione o checklist.'); return }
    if (!atividadeId) { setErro('Selecione o campo (atividade) do checklist.'); return }
    setErro('')
    setSalvando(true)

    const payload = {
      nome: nome.trim(),
      observacoes: observacoes.trim() || null,
      grupo_id: grupoId,
      subgrupo_id: subgrupoId,
      checklist_id: checklistId,
      atividade_id: atividadeId,
      documento_id: documentoId || null,
      atualizado_em: new Date().toISOString(),
    }

    const supabase = createClient()
    if (isEdicao) {
      const { error } = await supabase.from('causa_raiz').update(payload).eq('id', causa.id)
      if (error) { setErro('Não foi possível salvar a causa raiz.'); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('causa_raiz').insert({
        ...payload, unidade_id: unidadeAtiva?.id ?? null, status: 'ativo',
      })
      if (error) { setErro('Não foi possível criar a causa raiz.'); setSalvando(false); return }
    }

    setSalvando(false)
    toast.success(isEdicao ? 'Causa raiz salva.' : 'Causa raiz criada.')
    onSalvo?.()
    onClose()
  }

  const TIPO_LABEL: Record<string, string> = { pop: 'POP', it: 'IT' }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">{isEdicao ? 'Editar Causa Raiz' : 'Nova Causa Raiz'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          {/* Nome (principal) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome <span className="text-red-400">*</span></label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da causa raiz" autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" required />
          </div>

          {/* Setor + Área */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{grupoLabel.replace(/s$/, '')} <span className="text-red-400">*</span></label>
              <select value={grupoId}
                onChange={e => { setGrupoId(e.target.value); setSubgrupoId(''); setChecklistId(''); setAtividadeId(''); setDocumentoId('') }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Escolha o {setor}</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.display_name || g.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{subgrupoLabel.replace(/s$/, '')} <span className="text-red-400">*</span></label>
              <select value={subgrupoId} disabled={!grupoId}
                onChange={e => { setSubgrupoId(e.target.value); setChecklistId(''); setAtividadeId(''); setDocumentoId('') }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50">
                <option value="">Escolha a {area}</option>
                {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Checklist <span className="text-red-400">*</span></label>
            <select value={checklistId} disabled={!subgrupoId}
              onChange={e => { setChecklistId(e.target.value); setAtividadeId('') }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50">
              <option value="">Escolha o checklist</option>
              {checklists.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {subgrupoId && checklists.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Nenhum checklist nesta {area}. Crie um checklist antes.</p>
            )}
          </div>

          {/* Campo (atividade) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campo do checklist <span className="text-red-400">*</span></label>
            <select value={atividadeId} disabled={!checklistId}
              onChange={e => setAtividadeId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50">
              <option value="">Escolha o campo</option>
              {atividades.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              placeholder="orientações da causa raiz" rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          </div>

          {/* Documento de Apoio (POP ou IT do grupo/subgrupo) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Documento de Apoio <span className="text-gray-400 font-normal">(opcional)</span></label>
            <select value={documentoId} onChange={e => setDocumentoId(e.target.value)}
              disabled={!subgrupoId}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50">
              <option value="">escolha o documento</option>
              {documentos.map(d => (
                <option key={d.id} value={d.id}>[{TIPO_LABEL[d.tipo]}] {d.nome}</option>
              ))}
            </select>
            {subgrupoId && documentos.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Nenhum POP ou IT nesta {area}.</p>
            )}
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : isEdicao ? 'Salvar alterações' : 'Criar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
