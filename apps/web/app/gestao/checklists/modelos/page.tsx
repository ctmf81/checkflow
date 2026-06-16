'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LayoutGrid, Loader2, Eye, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/feedback'

interface Template {
  id: string
  nome: string
  descricao: string | null
  template_segmentos: string[]
  nSecoes: number
  nAtividades: number
}

const SEGMENTO_LABEL: Record<string, string> = {
  oficina: 'Oficina', automotivo: 'Automotivo', restaurante: 'Restaurante', food: 'Alimentação',
  fabrica: 'Fábrica', industria: 'Indústria', varejo: 'Varejo', mercado: 'Mercado',
  clinica: 'Clínica', saude: 'Saúde', limpeza: 'Limpeza', facilities: 'Facilities',
  construcao: 'Construção', logistica: 'Logística', generico: 'Genérico',
}
const segLabel = (s: string) => SEGMENTO_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1)

export default function ModelosPage() {
  const router = useRouter()
  const toast = useToast()
  const { unidadeAtiva, unidades } = useSession()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string | null>(null)
  const [usando, setUsando] = useState<Template | null>(null)
  const [preview, setPreview] = useState<Template | null>(null)

  async function carregar() {
    setLoading(true)
    const { data } = await createClient().from('checklists')
      .select('id, nome, descricao, template_segmentos, secoes:checklist_secoes(count), atividades:checklist_atividades(count)')
      .eq('is_template', true).order('nome')
    setTemplates((data ?? []).map((t: any) => ({
      id: t.id, nome: t.nome, descricao: t.descricao, template_segmentos: t.template_segmentos ?? [],
      nSecoes: t.secoes?.[0]?.count ?? 0, nAtividades: t.atividades?.[0]?.count ?? 0,
    })))
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  const segmentos = Array.from(new Set(templates.flatMap(t => t.template_segmentos))).sort()
  const filtrados = filtro ? templates.filter(t => t.template_segmentos.includes(filtro)) : templates

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-1">
        <button onClick={() => router.push('/gestao/checklists')} className="text-gray-400 hover:text-orange-500"><ChevronLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-800">Modelos prontos</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-9">Comece a partir de um modelo do seu segmento — depois é só ajustar e publicar.</p>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : templates.length === 0 ? (
        <div className="py-16 text-center">
          <LayoutGrid size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum modelo disponível ainda.</p>
        </div>
      ) : (
        <>
          {segmentos.length > 0 && (
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <button onClick={() => setFiltro(null)}
                className={`text-xs px-2.5 py-1 rounded-lg border ${!filtro ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>Todos</button>
              {segmentos.map(s => (
                <button key={s} onClick={() => setFiltro(s)}
                  className={`text-xs px-2.5 py-1 rounded-lg border ${filtro === s ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{segLabel(s)}</button>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtrados.map(t => (
              <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col">
                <h3 className="font-semibold text-gray-800">{t.nome}</h3>
                {t.descricao && <p className="text-xs text-gray-500 mt-1 flex-1">{t.descricao}</p>}
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {t.template_segmentos.map(s => (
                    <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{segLabel(s)}</span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">{t.nSecoes} seção(ões) · {t.nAtividades} atividade(s)</p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 justify-center" onClick={() => setPreview(t)}><Eye size={13} /> Ver</Button>
                  <Button size="sm" className="flex-1 justify-center" onClick={() => setUsando(t)}><Check size={13} /> Usar</Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {preview && <PreviewModal template={preview} onClose={() => setPreview(null)} onUsar={() => { setUsando(preview); setPreview(null) }} />}
      {usando && (
        <UsarModal
          template={usando}
          unidadeAtiva={unidadeAtiva}
          unidades={unidades}
          onClose={() => setUsando(null)}
          onClonado={(novoId) => { toast.success('Modelo aplicado! Ajuste e publique.'); router.push(`/gestao/checklists/${novoId}/montar`) }}
        />
      )}
    </div>
  )
}

// ─── Preview (somente leitura) ──────────────────────────────
function PreviewModal({ template, onClose, onUsar }: { template: Template; onClose: () => void; onUsar: () => void }) {
  const [secoes, setSecoes] = useState<{ id: string; nome: string; atividades: { id: string; nome: string; tipo: string }[] }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const sb = createClient()
      const { data: secs } = await sb.from('checklist_secoes').select('id, nome, ordem').eq('checklist_id', template.id).order('ordem')
      const { data: atvs } = await sb.from('checklist_atividades').select('id, nome, tipo, secao_id, ordem').eq('checklist_id', template.id).order('ordem')
      setSecoes((secs ?? []).map((s: any) => ({
        id: s.id, nome: s.nome,
        atividades: (atvs ?? []).filter((a: any) => a.secao_id === s.id).map((a: any) => ({ id: a.id, nome: a.nome, tipo: a.tipo })),
      })))
      setLoading(false)
    })()
  }, [template.id])

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">{template.nome}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {loading ? <p className="text-sm text-gray-400 text-center py-6">Carregando...</p> : secoes.map(s => (
            <div key={s.id}>
              <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-1.5">{s.nome}</p>
              <ul className="space-y-1">
                {s.atividades.map(a => (
                  <li key={a.id} className="text-sm text-gray-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />{a.nome}
                    <span className="text-[10px] text-gray-400">({a.tipo})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          <Button size="sm" onClick={onUsar}><Check size={14} /> Usar este modelo</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Usar modelo (escolher unidade + nome → clonar) ─────────
function UsarModal({ template, unidadeAtiva, unidades, onClose, onClonado }: {
  template: Template
  unidadeAtiva: { id: string; nome: string } | null
  unidades: { id: string; nome: string }[]
  onClose: () => void
  onClonado: (novoId: string) => void
}) {
  const toast = useToast()
  const [nome, setNome] = useState(template.nome)
  const [unidadeId, setUnidadeId] = useState(unidadeAtiva?.id ?? '')
  const [salvando, setSalvando] = useState(false)

  async function clonar() {
    if (!unidadeId) { toast.error('Selecione a unidade de destino.'); return }
    if (!nome.trim()) { toast.error('Informe um nome para o checklist.'); return }
    setSalvando(true)
    const { data, error } = await createClient().rpc('clonar_template', {
      p_template_id: template.id, p_unidade_id: unidadeId, p_nome: nome.trim(),
    })
    setSalvando(false)
    if (error || !data) { toast.error(`Erro ao aplicar o modelo: ${error?.message ?? 'tente novamente'}`); return }
    onClonado(data as string)
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Usar modelo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome do checklist</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unidade de destino</label>
            <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} className={inputCls}>
              <option value="">Selecione…</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-400">O modelo será copiado como <b>rascunho</b> nesta unidade. Você poderá ajustar tudo antes de publicar.</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={clonar} disabled={salvando}>
            {salvando ? <><Loader2 size={13} className="animate-spin" /> Aplicando…</> : 'Criar checklist'}
          </Button>
        </div>
      </div>
    </div>
  )
}
