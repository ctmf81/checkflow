'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, LayoutGrid, Pencil, Trash2, Sparkles, Loader2, X } from 'lucide-react'
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
  const [gerarAberto, setGerarAberto] = useState(false)

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
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setGerarAberto(true)}><Sparkles size={14} /> Gerar com IA</Button>
          <Button size="sm" onClick={() => router.push('/sistema/templates/novo/montar')}><Plus size={14} /> Novo modelo</Button>
        </div>
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

      {gerarAberto && <GerarIAModal onClose={() => setGerarAberto(false)} onGerado={(id) => router.push(`/sistema/templates/${id}/montar`)} />}
    </>
  )
}

function GerarIAModal({ onClose, onGerado }: { onClose: () => void; onGerado: (id: string) => void }) {
  const toast = useToast()
  const [descricao, setDescricao] = useState('')
  const [segmentos, setSegmentos] = useState('')
  const [gerando, setGerando] = useState(false)

  async function gerar() {
    if (!descricao.trim()) { toast.error('Descreva o checklist que deseja gerar.'); return }
    setGerando(true)
    const { data: { session } } = await createClient().auth.getSession()
    try {
      const res = await fetch('/api/templates/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ descricao: descricao.trim(), segmentos: segmentos.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.id) { toast.error(json?.error ?? 'Falha ao gerar o modelo.'); setGerando(false); return }
      toast.success('Modelo gerado! Revise e publique.')
      onGerado(json.id)
    } catch {
      toast.error('Erro de conexão.'); setGerando(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 inline-flex items-center gap-2"><Sparkles size={16} className="text-orange-500" /> Gerar modelo com IA</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={gerando}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">O que você precisa?</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={4} className={inputCls}
              placeholder="Ex: Checklist de abertura de restaurante, com foco em higiene e segurança alimentar, conferindo temperatura de câmaras e uniforme da equipe." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Segmentos (vírgula, opcional)</label>
            <input value={segmentos} onChange={e => setSegmentos(e.target.value)} className={inputCls} placeholder="restaurante, food" />
          </div>
          <p className="text-xs text-gray-400">A IA gera um rascunho com seções e atividades. Você revisa e ajusta no montador antes de publicar.</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <Button variant="outline" size="sm" onClick={onClose} disabled={gerando}>Cancelar</Button>
          <Button size="sm" onClick={gerar} disabled={gerando}>
            {gerando ? <><Loader2 size={13} className="animate-spin" /> Gerando…</> : <><Sparkles size={14} /> Gerar</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
