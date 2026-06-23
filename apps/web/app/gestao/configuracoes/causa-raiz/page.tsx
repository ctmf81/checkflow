'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, AlertCircle, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { CausaRaizModal } from './CausaRaizModal'

interface CausaRaiz {
  id: string
  nome: string
  observacoes: string | null
  grupo_id: string | null
  subgrupo_id: string | null
  checklist_id: string | null
  atividade_id: string | null
  documento_id: string | null
  grupo_nome?: string
  subgrupo_nome?: string
  checklist_nome?: string
  atividade_nome?: string
  documento_nome?: string
  documento_tipo?: string
}

const TIPO_COR: Record<string, string> = {
  pop: 'bg-blue-50 text-blue-600',
  it:  'bg-purple-50 text-purple-600',
}

export default function CausaRaizPage() {
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const [causas, setCausas] = useState<CausaRaiz[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<CausaRaiz | undefined>()

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await createClient()
      .from('causa_raiz')
      .select(`
        id, nome, observacoes, grupo_id, subgrupo_id, checklist_id, atividade_id, documento_id,
        grupo:grupo_id(nome, display_name),
        subgrupo:subgrupo_id(nome),
        checklist:checklist_id(nome),
        atividade:atividade_id(nome),
        documento:documento_id(nome, tipo)
      `)
      .eq('unidade_id', unidadeAtiva.id)
      .eq('status', 'ativo')
      .order('nome')

    if (error) { toast.error('Não foi possível carregar as causas raiz.'); setLoading(false); return }
    if (data) {
      setCausas(data.map((c: any) => ({
        id: c.id,
        nome: c.nome,
        observacoes: c.observacoes,
        grupo_id: c.grupo_id,
        subgrupo_id: c.subgrupo_id,
        checklist_id: c.checklist_id,
        atividade_id: c.atividade_id,
        documento_id: c.documento_id,
        grupo_nome: c.grupo ? (c.grupo.display_name || c.grupo.nome) : null,
        subgrupo_nome: c.subgrupo?.nome ?? null,
        checklist_nome: c.checklist?.nome ?? null,
        atividade_nome: c.atividade?.nome ?? null,
        documento_nome: c.documento?.nome ?? null,
        documento_tipo: c.documento?.tipo ?? null,
      })))
    }
    setLoading(false)
  }

  async function excluir(id: string, nome: string) {
    if (!await confirm({ titulo: `Excluir "${nome}"?`, confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('causa_raiz').update({ status: 'inativo' }).eq('id', id)
    if (error) { toast.error('Não foi possível excluir a causa raiz.'); return }
    toast.success('Causa raiz excluída.')
    carregar()
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  const cfg = getOnboardingConfig('config-causa-raiz')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Causa Raiz</h1>
          <p className="text-sm text-gray-500 mt-0.5">Causas raiz vinculadas a checklists e atividades</p>
          <p className="text-xs text-gray-400 mt-0.5">Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></p>
        </div>
        <Button onClick={() => { setEditando(undefined); setModal(true) }}>
          <Plus size={16} />Nova causa raiz
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : causas.length === 0 ? (
        <div className="py-16 text-center">
          <GitBranch size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma causa raiz cadastrada.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {causas.map(causa => (
            <div key={causa.id}
              className="flex items-start gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <GitBranch size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{causa.nome}</p>

                {causa.observacoes && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{causa.observacoes}</p>
                )}

                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {causa.grupo_nome && (
                    <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
                      {grupoLabel}: {causa.grupo_nome}
                    </span>
                  )}
                  {causa.subgrupo_nome && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                      {subgrupoLabel}: {causa.subgrupo_nome}
                    </span>
                  )}
                  {causa.checklist_nome && (
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                      Checklist: {causa.checklist_nome}
                    </span>
                  )}
                  {causa.atividade_nome && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      Campo: {causa.atividade_nome}
                    </span>
                  )}
                  {causa.documento_nome && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_COR[causa.documento_tipo ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                      {causa.documento_tipo?.toUpperCase()}: {causa.documento_nome}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => { setEditando(causa); setModal(true) }}
                  className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => excluir(causa.id, causa.nome)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <CausaRaizModal
          causa={editando}
          onClose={() => { setModal(false); setEditando(undefined) }}
          onSalvo={() => { setModal(false); setEditando(undefined); carregar() }}
        />
      )}
    </>
  )
}
