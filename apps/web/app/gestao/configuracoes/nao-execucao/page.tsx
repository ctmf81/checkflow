'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, PowerOff, AlertCircle, Ban } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { MotivoModal } from './MotivoModal'

interface Motivo {
  id: string
  descricao: string
  tipo: 'checklist' | 'atividade'
  grupo_id: string | null
  subgrupo_id: string | null
  grupo_nome?: string
  subgrupo_nome?: string
}

export default function NaoExecucaoPage() {
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Motivo | undefined>()

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('nao_execucao_motivos')
      .select(`
        id, descricao, tipo, grupo_id, subgrupo_id,
        grupo:grupo_id(nome, display_name),
        subgrupo:subgrupo_id(nome)
      `)
      .eq('unidade_id', unidadeAtiva.id)
      .eq('status', 'ativo')
      .order('descricao')

    if (data) {
      setMotivos(data.map((m: any) => ({
        id: m.id,
        descricao: m.descricao,
        tipo: m.tipo ?? 'checklist',
        grupo_id: m.grupo_id,
        subgrupo_id: m.subgrupo_id,
        grupo_nome: m.grupo ? (m.grupo.display_name || m.grupo.nome) : null,
        subgrupo_nome: m.subgrupo?.nome ?? null,
      })))
    }
    setLoading(false)
  }

  async function desativar(id: string, descricao: string) {
    if (!confirm(`Desativar "${descricao}"?`)) return
    await createClient().from('nao_execucao_motivos').update({ status: 'inativo' }).eq('id', id)
    carregar()
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])

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
          <h1 className="text-xl font-semibold text-gray-800">Não execução</h1>
          <p className="text-sm text-gray-500 mt-0.5">Motivos para não execução de checklists ou atividades</p>
          <p className="text-xs text-gray-400 mt-0.5">Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></p>
        </div>
        <Button onClick={() => { setEditando(undefined); setModal(true) }}>
          <Plus size={16} />Novo motivo
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : motivos.length === 0 ? (
        <div className="py-16 text-center">
          <Ban size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum motivo cadastrado.</p>
          <p className="text-xs text-gray-400 mt-1">Clique em &quot;Novo motivo&quot; para adicionar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {motivos.map(motivo => (
            <div key={motivo.id}
              className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <Ban size={16} className="text-gray-300 flex-shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-gray-800">{motivo.descricao}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    motivo.tipo === 'atividade'
                      ? 'bg-purple-50 text-purple-600'
                      : 'bg-blue-50 text-blue-600'
                  }`}>
                    {motivo.tipo === 'atividade' ? 'Atividade' : 'Checklist'}
                  </span>
                </div>
                {(motivo.grupo_nome || motivo.subgrupo_nome) && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {motivo.grupo_nome && (
                      <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
                        {grupoLabel}: {motivo.grupo_nome}
                      </span>
                    )}
                    {motivo.subgrupo_nome && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                        {subgrupoLabel}: {motivo.subgrupo_nome}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setEditando(motivo); setModal(true) }}
                  className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => desativar(motivo.id, motivo.descricao)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                  <PowerOff size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <MotivoModal
          motivo={editando}
          onClose={() => { setModal(false); setEditando(undefined) }}
          onSalvo={() => { setModal(false); setEditando(undefined); carregar() }}
        />
      )}
    </>
  )
}
