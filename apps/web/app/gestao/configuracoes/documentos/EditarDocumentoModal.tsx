'use client'

import { useEffect, useState } from 'react'
import { X, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Documento {
  id: string
  nome: string
  descricao: string | null
  tipo: string
  norma_referencia: string | null
  grupo_id: string | null
  subgrupo_id: string | null
}

interface Grupo { id: string; nome: string; display_name: string | null }
interface Subgrupo { id: string; nome: string }

interface Props {
  documento: Documento
  onClose: () => void
  onSalvo?: () => void
}

const TIPOS = [
  { value: 'pop', label: 'Procedimento Operacional Padrão (POP)' },
  { value: 'it',  label: 'Instrução de Trabalho (IT)' },
  { value: 'consulta_inteligente', label: 'Consulta Inteligente' },
]

export function EditarDocumentoModal({ documento, onClose, onSalvo }: Props) {
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const [nome, setNome] = useState(documento.nome)
  const [descricao, setDescricao] = useState(documento.descricao ?? '')
  const [tipo, setTipo] = useState(documento.tipo)
  const [norma, setNorma] = useState(documento.norma_referencia ?? '')
  const [grupoId, setGrupoId] = useState(documento.grupo_id ?? '')
  const [subgrupoId, setSubgrupoId] = useState(documento.subgrupo_id ?? '')
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!unidadeAtiva?.id) return
    createClient().from('grupos').select('id, nome, display_name')
      .eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setGrupos(data) })
  }, [unidadeAtiva?.id])

  useEffect(() => {
    if (!grupoId) { setSubgrupos([]); return }
    createClient().from('subgrupos').select('id, nome')
      .eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })
  }, [grupoId])

  async function salvar() {
    setErro('')
    setSalvando(true)
    const { error } = await createClient().from('documentos').update({
      nome,
      descricao: descricao || null,
      tipo,
      norma_referencia: norma || null,
      grupo_id: grupoId || null,
      subgrupo_id: subgrupoId || null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', documento.id)

    setSalvando(false)
    if (error) { setErro('Erro ao salvar.'); return }
    onSalvo?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">Editar documento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do documento</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
              {grupoLabel}
              <span className="text-gray-400 cursor-help"
                title={`Opcional. Sem ${grupoLabel.toLowerCase()}, o documento fica disponível para todos da unidade.`}>
                <Info size={13} />
              </span>
            </label>
            <select value={grupoId} onChange={e => { setGrupoId(e.target.value); setSubgrupoId('') }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Todos da unidade</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.display_name || g.nome}</option>)}
            </select>
          </div>

          {grupoId && (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                {subgrupoLabel}
                <span className="text-gray-400 cursor-help"
                  title={`Opcional. Sem ${subgrupoLabel.toLowerCase()}, o documento fica disponível para todos do ${grupoLabel.toLowerCase()} escolhido.`}>
                  <Info size={13} />
                </span>
              </label>
              <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Todos do {grupoLabel.toLowerCase()}</option>
                {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
              Tipo <Info size={13} className="text-gray-400" />
            </label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {(tipo === 'pop' || tipo === 'it') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Norma de Referência</label>
              <input value={norma} onChange={e => setNorma(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            </div>
          )}

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar alterações'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
