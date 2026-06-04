'use client'

import { useEffect, useState } from 'react'
import { X, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Props {
  documentoId: string
  documentoNome: string
  onClose: () => void
  onDuplicado?: () => void
}

interface Unidade { id: string; nome: string }
interface Grupo { id: string; nome: string; display_name: string | null }
interface Subgrupo { id: string; nome: string }

export function DuplicarDocumentoModal({ documentoId, documentoNome, onClose, onDuplicado }: Props) {
  const { unidadeAtiva, empresaAtiva } = useSession()

  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])

  const [unidadeId, setUnidadeId] = useState(unidadeAtiva?.id ?? '')
  const [grupoId, setGrupoId] = useState('')
  const [subgrupoId, setSubgrupoId] = useState('')

  const [duplicando, setDuplicando] = useState(false)
  const [erro, setErro] = useState('')

  // Carrega unidades da empresa
  useEffect(() => {
    if (!empresaAtiva?.id) return
    createClient().from('unidades').select('id, nome')
      .eq('empresa_id', empresaAtiva.id).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setUnidades(data) })
  }, [empresaAtiva?.id])

  // Carrega grupos quando muda a unidade
  useEffect(() => {
    setGrupoId('')
    setSubgrupoId('')
    if (!unidadeId) { setGrupos([]); return }
    createClient().from('grupos').select('id, nome, display_name')
      .eq('unidade_id', unidadeId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setGrupos(data) })
  }, [unidadeId])

  // Carrega subgrupos quando muda o grupo
  useEffect(() => {
    setSubgrupoId('')
    if (!grupoId) { setSubgrupos([]); return }
    createClient().from('subgrupos').select('id, nome')
      .eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })
  }, [grupoId])

  async function duplicar() {
    if (!unidadeId) { setErro('Selecione uma unidade.'); return }
    setErro('')
    setDuplicando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Busca documento original
    const { data: orig } = await supabase.from('documentos')
      .select('nome, descricao, tipo, norma_referencia')
      .eq('id', documentoId).single()
    if (!orig) { setErro('Documento não encontrado.'); setDuplicando(false); return }

    // Cria o documento duplicado
    const { data: novo, error } = await supabase.from('documentos').insert({
      nome: `${orig.nome} (cópia)`,
      descricao: orig.descricao,
      tipo: orig.tipo,
      norma_referencia: orig.norma_referencia,
      unidade_id: unidadeId,
      grupo_id: grupoId || null,
      subgrupo_id: subgrupoId || null,
      criado_por: user?.id ?? null,
      status: 'ativo',
    }).select('id').single()

    if (error || !novo) { setErro('Erro ao duplicar.'); setDuplicando(false); return }

    // Duplica as etapas
    const { data: etapas } = await supabase.from('documento_etapas')
      .select('titulo, conteudo, video_id, ordem').eq('documento_id', documentoId).order('ordem')

    if (etapas && etapas.length > 0) {
      const { data: novasEtapas } = await supabase.from('documento_etapas')
        .insert(etapas.map(e => ({ ...e, documento_id: novo.id }))).select('id, ordem')

      // Duplica imagens de cada etapa
      if (novasEtapas) {
        for (const novaEtapa of novasEtapas) {
          const etapaOrigIdx = novasEtapas.indexOf(novaEtapa)
          const etapaOrigId = etapas[etapaOrigIdx] // mesmo índice = mesma etapa
          if (!etapaOrigId) continue

          // Busca etapa original pelo ordem
          const { data: etapaOrigDb } = await supabase.from('documento_etapas')
            .select('id').eq('documento_id', documentoId).eq('ordem', novaEtapa.ordem).single()
          if (!etapaOrigDb) continue

          const { data: imgs } = await supabase.from('etapa_imagens')
            .select('url, ordem').eq('etapa_id', etapaOrigDb.id).order('ordem')
          if (imgs && imgs.length > 0) {
            await supabase.from('etapa_imagens').insert(imgs.map(i => ({ ...i, etapa_id: novaEtapa.id })))
          }
        }
      }
    }

    setDuplicando(false)
    onDuplicado?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Copy size={16} className="text-orange-400" />
            <h2 className="font-semibold text-gray-800">Duplicar documento</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Duplicando: <span className="font-medium text-gray-700">{documentoNome}</span>
          </p>

          {/* Unidade */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unidade de destino</label>
            <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              required>
              <option value="">Selecione a unidade</option>
              {unidades.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nome}{u.id === unidadeAtiva?.id ? ' (atual)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Grupo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grupo <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select value={grupoId} onChange={e => setGrupoId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              disabled={!unidadeId}>
              <option value="">Nenhum</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.display_name || g.nome}</option>)}
            </select>
          </div>

          {/* Subgrupo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Área <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              disabled={!grupoId}>
              <option value="">Nenhum</option>
              {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={duplicar} disabled={duplicando || !unidadeId}>
              {duplicando ? 'Duplicando...' : 'Duplicar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
