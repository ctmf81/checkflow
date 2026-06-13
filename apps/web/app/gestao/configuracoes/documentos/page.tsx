'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, FileText, Search, MoreVertical, AlertCircle, Pencil, Layers, PowerOff, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { NovoDocumentoModal, DocumentoBase } from './NovoDocumentoModal'
import { EditarDocumentoModal } from './EditarDocumentoModal'
import { DuplicarDocumentoModal } from './DuplicarDocumentoModal'
import { EtapasModal } from './EtapasModal'
import { ConsultaInteligenteModal } from './ConsultaInteligenteModal'

interface Documento {
  id: string
  nome: string
  tipo: string
  descricao: string | null
  norma_referencia: string | null
  arquivo_url: string | null
  grupo_id: string | null
  subgrupo_id: string | null
  criado_em: string
}

const TIPO_LABEL: Record<string, string> = {
  pop: 'POP', it: 'IT', consulta_inteligente: 'Consulta Inteligente',
}
const TIPO_COR: Record<string, string> = {
  pop: 'bg-blue-50 text-blue-600',
  it: 'bg-purple-50 text-purple-600',
  consulta_inteligente: 'bg-green-50 text-green-600',
}

function DocMenu({ doc, onEditar, onEtapas, onDuplicar, onExcluir }: {
  doc: Documento
  onEditar: () => void
  onEtapas: () => void
  onDuplicar: () => void
  onExcluir: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto(!aberto)} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100 truncate">{doc.nome}</div>
          <button onClick={() => { setAberto(false); onEditar() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            <Pencil size={14} className="text-gray-400" />Editar documento
          </button>
          {(doc.tipo === 'pop' || doc.tipo === 'it') && (
            <button onClick={() => { setAberto(false); onEtapas() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              <Layers size={14} className="text-gray-400" />Editar etapas
            </button>
          )}
          {doc.tipo === 'consulta_inteligente' && (
            <button onClick={() => { setAberto(false); onEtapas() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              <Pencil size={14} className="text-gray-400" />Editar conteúdo
            </button>
          )}
          <button onClick={() => { setAberto(false); onDuplicar() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            <Copy size={14} className="text-gray-400" />Duplicar documento
          </button>
          <div className="border-t border-gray-100 mt-1">
            <button onClick={() => { setAberto(false); onExcluir() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50">
              <PowerOff size={14} />Excluir documento
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DocumentosPage() {
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [grupos, setGrupos] = useState<{ id: string; nome: string; display_name: string | null }[]>([])
  const [subgrupos, setSubgrupos] = useState<{ id: string; nome: string }[]>([])
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [filtroSubgrupo, setFiltroSubgrupo] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [docEditando, setDocEditando] = useState<Documento | null>(null)
  const [docDuplicando, setDocDuplicando] = useState<Documento | null>(null)
  const [docEtapas, setDocEtapas] = useState<Documento | null>(null)
  const [docConsulta, setDocConsulta] = useState<Documento | null>(null)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const [docsRes, gruposRes] = await Promise.all([
      supabase.from('documentos')
        .select('id, nome, tipo, descricao, norma_referencia, arquivo_url, grupo_id, subgrupo_id, criado_em')
        .eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome'),
      supabase.from('grupos').select('id, nome, display_name')
        .eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome'),
    ])
    if (docsRes.data) setDocumentos(docsRes.data)
    if (gruposRes.data) setGrupos(gruposRes.data)
    setLoading(false)
  }

  useEffect(() => {
    setFiltroGrupo('')
    setFiltroSubgrupo('')
    setFiltroTipo('')
    setBusca('')
    carregar()
  }, [unidadeAtiva?.id])

  useEffect(() => {
    setFiltroSubgrupo('')
    if (!filtroGrupo) { setSubgrupos([]); return }
    createClient().from('subgrupos').select('id, nome')
      .eq('grupo_id', filtroGrupo).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })
  }, [filtroGrupo])

  async function excluir(doc: Documento) {
    if (!await confirm({ titulo: `Excluir "${doc.nome}"?`, confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('documentos').update({ status: 'inativo' }).eq('id', doc.id)
    if (error) { toast.error('Não foi possível excluir o documento.'); return }
    toast.success('Documento excluído.')
    carregar()
  }

  function handleCriado(doc: DocumentoBase) {
    setModalNovo(false)
    carregar()
    if (doc.tipo === 'pop' || doc.tipo === 'it') {
      setDocEtapas(doc as Documento)
    } else if (doc.tipo === 'consulta_inteligente') {
      setDocConsulta(doc as Documento)
    }
  }

  const filtrados = documentos.filter(d => {
    const matchBusca = d.nome.toLowerCase().includes(busca.toLowerCase())
    const matchTipo = !filtroTipo || d.tipo === filtroTipo
    const matchGrupo = !filtroGrupo || d.grupo_id === filtroGrupo
    const matchSubgrupo = !filtroSubgrupo || d.subgrupo_id === filtroSubgrupo
    return matchBusca && matchTipo && matchGrupo && matchSubgrupo
  })

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  const cfg = getOnboardingConfig('config-documentos')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Documentos</h1>
          <p className="text-xs text-gray-400 mt-0.5">Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></p>
        </div>
        <Button onClick={() => setModalNovo(true)}><Plus size={16} />Novo documento</Button>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar documento"
            className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 w-52" />
        </div>

        {/* Filtro tipo */}
        {['', 'pop', 'it', 'consulta_inteligente'].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroTipo === t ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t === '' ? 'Todos' : TIPO_LABEL[t]}
          </button>
        ))}

        {/* Filtro grupo */}
        {grupos.length > 0 && (
          <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-200">
            <option value="">Todos os {grupoLabel.toLowerCase()}</option>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.display_name || g.nome}</option>)}
          </select>
        )}

        {/* Filtro subgrupo */}
        {filtroGrupo && subgrupos.length > 0 && (
          <select value={filtroSubgrupo} onChange={e => setFiltroSubgrupo(e.target.value)}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-200">
            <option value="">Todos os {subgrupoLabel.toLowerCase()}</option>
            {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}

        <span className="text-sm text-gray-500 ml-auto">{filtrados.length} documento{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

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
                <p className="font-medium text-sm text-gray-800 truncate">{doc.nome}</p>
                {doc.descricao && <p className="text-xs text-gray-400 truncate mt-0.5">{doc.descricao}</p>}
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${TIPO_COR[doc.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                {TIPO_LABEL[doc.tipo] ?? doc.tipo}
              </span>
              <DocMenu
                doc={doc}
                onEditar={() => setDocEditando(doc)}
                onEtapas={() => doc.tipo === 'consulta_inteligente' ? setDocConsulta(doc) : setDocEtapas(doc)}
                onDuplicar={() => setDocDuplicando(doc)}
                onExcluir={() => excluir(doc)}
              />
            </div>
          ))}
        </div>
      )}

      {modalNovo && <NovoDocumentoModal onClose={() => setModalNovo(false)} onCriado={handleCriado} />}

      {docDuplicando && (
        <DuplicarDocumentoModal
          documentoId={docDuplicando.id}
          documentoNome={docDuplicando.nome}
          onClose={() => setDocDuplicando(null)}
          onDuplicado={() => { setDocDuplicando(null); carregar() }}
        />
      )}

      {docEditando && (
        <EditarDocumentoModal
          documento={docEditando}
          onClose={() => setDocEditando(null)}
          onSalvo={() => { setDocEditando(null); carregar() }}
        />
      )}

      {docEtapas && (
        <EtapasModal documentoId={docEtapas.id} documentoNome={docEtapas.nome}
          onClose={() => { setDocEtapas(null); carregar() }} />
      )}

      {docConsulta && (
        <ConsultaInteligenteModal
          documentoId={docConsulta.id} documentoNome={docConsulta.nome}
          documentoDescricao={docConsulta.descricao} arquivoUrl={docConsulta.arquivo_url}
          criadoEm={docConsulta.criado_em}
          onClose={() => setDocConsulta(null)}
          onSalvo={() => { setDocConsulta(null); carregar() }}
        />
      )}
    </>
  )
}
