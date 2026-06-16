'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, LayoutGrid, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast, useConfirm } from '@/components/ui/feedback'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

interface TemplateRow {
  id: string
  nome: string
  descricao: string | null
  status: string
  template_segmentos: string[]
  nAtividades: number
}

export default function SistemaTemplatesPage() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    const { data } = await createClient().from('checklists')
      .select('id, nome, descricao, status, template_segmentos, atividades:checklist_atividades(count)')
      .eq('is_template', true).order('nome')
    setRows((data ?? []).map((t: any) => ({
      id: t.id, nome: t.nome, descricao: t.descricao, status: t.status,
      template_segmentos: t.template_segmentos ?? [], nAtividades: t.atividades?.[0]?.count ?? 0,
    })))
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  async function excluir(t: TemplateRow) {
    const ok = await confirm({
      titulo: `Excluir o modelo "${t.nome}"?`,
      mensagem: 'Checklists já criados a partir dele não são afetados.',
      confirmarLabel: 'Excluir', perigo: true,
    })
    if (!ok) return
    const { error } = await createClient().from('checklists').delete().eq('id', t.id)
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); return }
    toast.success('Modelo excluído.')
    carregar()
  }

  const cfg = getOnboardingConfig('sistema-templates')

  return (
    <>
      {cfg && <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Modelos de checklist</h1>
          <p className="text-sm text-gray-500 mt-0.5">Modelos prontos por segmento que as empresas podem clonar na galeria.</p>
        </div>
        <Button size="sm" onClick={() => router.push('/sistema/templates/novo/montar')}><Plus size={14} /> Novo modelo</Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <LayoutGrid size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum modelo cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-800">{t.nome}</h3>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.status === 'publicado' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                    {t.status === 'publicado' ? 'Publicado' : 'Rascunho'}
                  </span>
                </div>
                {t.descricao && <p className="text-xs text-gray-500 mt-0.5">{t.descricao}</p>}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {t.template_segmentos.map(s => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{s}</span>)}
                  <span className="text-xs text-gray-400 ml-1">{t.nAtividades} atividade(s)</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => router.push(`/sistema/templates/${t.id}/montar`)} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-gray-50"><Pencil size={15} /></button>
                <button onClick={() => excluir(t)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
