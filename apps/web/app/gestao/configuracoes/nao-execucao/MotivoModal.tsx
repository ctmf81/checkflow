'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast } from '@/components/ui/feedback'

interface Motivo {
  id: string
  descricao: string
  tipo: 'checklist' | 'atividade'
  grupo_id: string | null
  subgrupo_id: string | null
}

interface Grupo { id: string; nome: string; display_name: string | null }
interface Subgrupo { id: string; nome: string }

interface Props {
  motivo?: Motivo
  onClose: () => void
  onSalvo?: () => void
}

export function MotivoModal({ motivo, onClose, onSalvo }: Props) {
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const toast = useToast()
  const isEdicao = !!motivo

  const [descricao, setDescricao] = useState(motivo?.descricao ?? '')
  const [tipo, setTipo] = useState<'checklist' | 'atividade'>(motivo?.tipo ?? 'checklist')
  const [grupoId, setGrupoId] = useState(motivo?.grupo_id ?? '')
  const [subgrupoId, setSubgrupoId] = useState(motivo?.subgrupo_id ?? '')
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
    setSubgrupoId('')
    if (!grupoId) { setSubgrupos([]); return }
    createClient().from('subgrupos').select('id, nome')
      .eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })
  }, [grupoId])

  async function salvar() {
    if (!descricao.trim()) { setErro('Informe a descrição.'); return }
    setErro('')
    setSalvando(true)
    const supabase = createClient()

    if (isEdicao) {
      const { error } = await supabase.from('nao_execucao_motivos').update({
        descricao: descricao.trim(),
        tipo,
        grupo_id: grupoId || null,
        subgrupo_id: subgrupoId || null,
        atualizado_em: new Date().toISOString(),
      }).eq('id', motivo.id)
      if (error) { setErro('Erro ao salvar.'); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('nao_execucao_motivos').insert({
        descricao: descricao.trim(),
        tipo,
        grupo_id: grupoId || null,
        subgrupo_id: subgrupoId || null,
        unidade_id: unidadeAtiva?.id ?? null,
        status: 'ativo',
      })
      if (error) { setErro('Erro ao criar.'); setSalvando(false); return }
    }

    setSalvando(false)
    toast.success(isEdicao ? 'Motivo salvo.' : 'Motivo criado.')
    onSalvo?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            {isEdicao ? 'Editar motivo' : 'Novo motivo de não execução'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Equipamento em manutenção, Área interditada..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
              autoFocus
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de não execução</label>
            <div className="flex gap-3">
              {(['checklist', 'atividade'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                    tipo === t
                      ? 'border-orange-500 bg-orange-50 text-orange-600'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {t === 'checklist' ? '📋 Checklist' : '✅ Atividade'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {tipo === 'checklist'
                ? 'Motivo para não executar o checklist inteiro.'
                : 'Motivo para não executar uma atividade específica do checklist.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {grupoLabel} <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select value={grupoId} onChange={e => setGrupoId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Todos</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.display_name || g.nome}</option>)}
            </select>
          </div>

          {grupoId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {subgrupoLabel} <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Todos</option>
                {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          )}

          <div className="bg-blue-50 rounded-lg px-4 py-3">
            <p className="text-xs text-blue-600 font-medium mb-0.5">Checklists</p>
            <p className="text-xs text-blue-500">A vinculação com checklists estará disponível após a criação dos checklists.</p>
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : isEdicao ? 'Salvar alterações' : 'Criar motivo'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
