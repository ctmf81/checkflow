'use client'

import { useEffect, useState } from 'react'
import { X, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

export interface DocumentoBase {
  id: string
  nome: string
  tipo: 'pop' | 'it' | 'consulta_inteligente'
}

interface Grupo { id: string; nome: string; display_name: string | null }
interface Subgrupo { id: string; nome: string }

interface Props {
  onClose: () => void
  onCriado: (doc: DocumentoBase) => void
}

const TIPOS = [
  { value: 'pop', label: 'Procedimento Operacional Padrão (POP)' },
  { value: 'it',  label: 'Instrução de Trabalho (IT)' },
  { value: 'consulta_inteligente', label: 'Consulta Inteligente' },
]

export function NovoDocumentoModal({ onClose, onCriado }: Props) {
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState('')
  const [norma, setNorma] = useState('')
  const [grupoId, setGrupoId] = useState('')
  const [subgrupoId, setSubgrupoId] = useState('')
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
    if (!grupoId) { setSubgrupos([]); setSubgrupoId(''); return }
    createClient().from('subgrupos').select('id, nome')
      .eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })
  }, [grupoId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tipo) { setErro('Selecione o tipo do documento.'); return }
    setErro('')
    setSalvando(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase.from('documentos').insert({
      nome,
      descricao: descricao || null,
      tipo,
      norma_referencia: norma || null,
      unidade_id: unidadeAtiva?.id ?? null,
      grupo_id: grupoId || null,
      subgrupo_id: subgrupoId || null,
      criado_por: user?.id ?? null,
      status: 'ativo',
    }).select('id, nome, tipo').single()

    setSalvando(false)
    if (error || !data) { setErro('Erro ao criar documento.'); return }

    onCriado(data as DocumentoBase)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">Novo Documento de Ajuda</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          {/* Setor */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
              {grupoLabel} principal <Info size={13} className="text-gray-400" />
            </label>
            <select value={grupoId} onChange={e => setGrupoId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Escolha aqui</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.display_name || g.nome}</option>)}
            </select>
          </div>

          {/* Área */}
          {grupoId && (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                {subgrupoLabel} principal <Info size={13} className="text-gray-400" />
              </label>
              <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Escolha aqui</option>
                {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do documento</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="nome do documento"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              required />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição do documento</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="descrição do documento" rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          </div>

          {/* Tipo */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
              Tipo do documento <Info size={13} className="text-gray-400" />
            </label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              required>
              <option value="">Tipo do documento</option>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Norma — só para POP e IT */}
          {(tipo === 'pop' || tipo === 'it') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Norma de Referência</label>
              <input value={norma} onChange={e => setNorma(e.target.value)} placeholder="nome do pop"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            </div>
          )}

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Criando...' : 'Continuar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
