'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface CausaRaiz {
  id: string
  nome: string
  observacoes: string | null
  grupo_id: string | null
  subgrupo_id: string | null
  documento_id: string | null
}

interface Grupo    { id: string; nome: string; display_name: string | null }
interface Subgrupo { id: string; nome: string }
interface Documento { id: string; nome: string; tipo: string }

interface Props {
  causa?: CausaRaiz
  onClose: () => void
  onSalvo?: () => void
}

export function CausaRaizModal({ causa, onClose, onSalvo }: Props) {
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const isEdicao = !!causa

  const [nome, setNome] = useState(causa?.nome ?? '')
  const [observacoes, setObservacoes] = useState(causa?.observacoes ?? '')
  const [grupoId, setGrupoId] = useState(causa?.grupo_id ?? '')
  const [subgrupoId, setSubgrupoId] = useState(causa?.subgrupo_id ?? '')
  const [documentoId, setDocumentoId] = useState(causa?.documento_id ?? '')

  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])
  const [documentos, setDocumentos] = useState<Documento[]>([])

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Carrega grupos
  useEffect(() => {
    if (!unidadeAtiva?.id) return
    createClient().from('grupos').select('id, nome, display_name')
      .eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setGrupos(data) })
  }, [unidadeAtiva?.id])

  // Carrega subgrupos e documentos ao mudar grupo
  useEffect(() => {
    setSubgrupoId('')
    setDocumentoId('')
    setSubgrupos([])
    setDocumentos([])
    if (!grupoId) return

    const supabase = createClient()
    supabase.from('subgrupos').select('id, nome')
      .eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })

    // Documentos POP/IT do grupo
    supabase.from('documentos').select('id, nome, tipo')
      .eq('grupo_id', grupoId).eq('status', 'ativo')
      .in('tipo', ['pop', 'it']).order('nome')
      .then(({ data }) => { if (data) setDocumentos(data) })
  }, [grupoId])

  // Refina documentos ao mudar subgrupo
  useEffect(() => {
    setDocumentoId('')
    if (!grupoId) return
    const supabase = createClient()
    let q = supabase.from('documentos').select('id, nome, tipo')
      .eq('grupo_id', grupoId).eq('status', 'ativo').in('tipo', ['pop', 'it'])
    if (subgrupoId) q = q.eq('subgrupo_id', subgrupoId) as typeof q
    q.order('nome').then(({ data }) => { if (data) setDocumentos(data) })
  }, [subgrupoId])

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome.'); return }
    setErro('')
    setSalvando(true)
    const supabase = createClient()

    const payload = {
      nome: nome.trim(),
      observacoes: observacoes.trim() || null,
      grupo_id: grupoId || null,
      subgrupo_id: subgrupoId || null,
      documento_id: documentoId || null,
      atualizado_em: new Date().toISOString(),
    }

    if (isEdicao) {
      const { error } = await supabase.from('causa_raiz').update(payload).eq('id', causa.id)
      if (error) { setErro('Erro ao salvar.'); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('causa_raiz').insert({
        ...payload, unidade_id: unidadeAtiva?.id ?? null, status: 'ativo'
      })
      if (error) { setErro('Erro ao criar.'); setSalvando(false); return }
    }

    setSalvando(false)
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
          {/* Setor + Área em grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{grupoLabel.replace(/s$/, '')}</label>
              <select value={grupoId} onChange={e => setGrupoId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Escolha o {grupoLabel.toLowerCase().replace(/s$/, '')}</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.display_name || g.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{subgrupoLabel.replace(/s$/, '')}</label>
              <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)}
                disabled={!grupoId}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50">
                <option value="">Escolha a {subgrupoLabel.toLowerCase().replace(/s$/, '')}</option>
                {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Checklist — placeholder */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Checklist</label>
            <select disabled className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed">
              <option>Escolha o checklist</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Disponível após a criação dos checklists.</p>
          </div>

          {/* Campo do Checklist — placeholder */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campo do Checklist</label>
            <select disabled className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed">
              <option>Escolha o campo</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Disponível após a criação dos checklists.</p>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da causa raiz"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Documento de Apoio</label>
            <select value={documentoId} onChange={e => setDocumentoId(e.target.value)}
              disabled={!grupoId}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50">
              <option value="">escolha o documento</option>
              {documentos.map(d => (
                <option key={d.id} value={d.id}>
                  [{TIPO_LABEL[d.tipo]}] {d.nome}
                </option>
              ))}
            </select>
            {!grupoId && (
              <p className="text-xs text-gray-400 mt-1">Selecione um {grupoLabel.toLowerCase()} para ver os documentos disponíveis.</p>
            )}
            {grupoId && documentos.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Nenhum POP ou IT encontrado neste {grupoLabel.toLowerCase()}.</p>
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
