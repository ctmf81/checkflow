'use client'

import { useEffect, useState } from 'react'
import { Plus, FileText, Search, MoreVertical, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { NovoDocumentoModal, DocumentoBase } from './NovoDocumentoModal'
import { EtapasModal } from './EtapasModal'

interface Documento {
  id: string
  nome: string
  tipo: string
  descricao: string | null
  norma_referencia: string | null
  criado_em: string
}

const TIPO_LABEL: Record<string, string> = {
  pop: 'POP',
  it: 'IT',
  consulta_inteligente: 'Consulta Inteligente',
}

const TIPO_COR: Record<string, string> = {
  pop: 'bg-blue-50 text-blue-600',
  it: 'bg-purple-50 text-purple-600',
  consulta_inteligente: 'bg-green-50 text-green-600',
}

export default function DocumentosPage() {
  const { unidadeAtiva } = useSession()
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [docEtapas, setDocEtapas] = useState<DocumentoBase | null>(null)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const { data } = await createClient()
      .from('documentos').select('id, nome, tipo, descricao, norma_referencia, criado_em')
      .eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')
    if (data) setDocumentos(data)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])

  function handleCriado(doc: DocumentoBase) {
    setModalNovo(false)
    carregar()
    // Para POP e IT, abre o modal de etapas
    if (doc.tipo === 'pop' || doc.tipo === 'it') {
      setDocEtapas(doc)
    }
  }

  const filtrados = documentos.filter(d => {
    const matchBusca = d.nome.toLowerCase().includes(busca.toLowerCase())
    const matchTipo = !filtroTipo || d.tipo === filtroTipo
    return matchBusca && matchTipo
  })

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Documentos</h1>
          <p className="text-xs text-gray-400 mt-0.5">Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></p>
        </div>
        <Button onClick={() => setModalNovo(true)}><Plus size={16} />Novo documento</Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar documento"
            className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 w-52" />
        </div>
        {['', 'pop', 'it', 'consulta_inteligente'].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroTipo === t ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {t === '' ? 'Todos' : TIPO_LABEL[t]}
          </button>
        ))}
        <span className="text-sm text-gray-500 ml-auto">{filtrados.length} documento{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-16 text-center">
          <FileText size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum documento cadastrado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {filtrados.map(doc => (
            <div key={doc.id} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <FileText size={18} className="text-gray-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => (doc.tipo === 'pop' || doc.tipo === 'it') && setDocEtapas(doc)}
                  className={`font-medium text-sm text-gray-800 text-left ${(doc.tipo === 'pop' || doc.tipo === 'it') ? 'hover:text-orange-500 cursor-pointer' : ''}`}
                >
                  {doc.nome}
                </button>
                {doc.descricao && <p className="text-xs text-gray-400 truncate mt-0.5">{doc.descricao}</p>}
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${TIPO_COR[doc.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                {TIPO_LABEL[doc.tipo] ?? doc.tipo}
              </span>
              <button className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"><MoreVertical size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {modalNovo && <NovoDocumentoModal onClose={() => setModalNovo(false)} onCriado={handleCriado} />}

      {docEtapas && (
        <EtapasModal
          documentoId={docEtapas.id}
          documentoNome={docEtapas.nome}
          onClose={() => { setDocEtapas(null); carregar() }}
        />
      )}
    </>
  )
}
