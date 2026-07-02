'use client'

import { useEffect, useState } from 'react'
import { Plus, BookOpen, Pencil, Trash2, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast, useConfirm } from '@/components/ui/feedback'

interface Artigo {
  id: string
  categoria: string
  titulo: string
  conteudo: string
  video_url: string | null
  ordem: number
  publicado: boolean
}

export default function SistemaAjudaPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<Artigo[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Artigo | null>(null)
  const [aberto, setAberto] = useState(false)

  async function carregar() {
    setLoading(true)
    const { data } = await createClient().from('ajuda_artigos')
      .select('*').order('categoria').order('ordem')
    setRows((data ?? []) as Artigo[])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  async function excluir(a: Artigo) {
    if (!await confirm({ titulo: `Excluir "${a.titulo}"?`, confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('ajuda_artigos').delete().eq('id', a.id)
    if (error) { toast.error('Erro ao excluir artigo. Tente novamente.'); return }
    toast.success('Artigo excluído.'); carregar()
  }

  const categorias = Array.from(new Set(rows.map(r => r.categoria)))

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Central de ajuda</h1>
          <p className="text-sm text-gray-500 mt-0.5">Artigos e vídeos que aparecem para as empresas em Gestão → Ajuda.</p>
        </div>
        <Button size="sm" onClick={() => { setEditando(null); setAberto(true) }}><Plus size={14} /> Novo artigo</Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <BookOpen size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum artigo cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categorias.map(cat => (
            <div key={cat}>
              <h2 className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-2">{cat}</h2>
              <div className="space-y-2">
                {rows.filter(r => r.categoria === cat).map(a => (
                  <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{a.titulo}</span>
                        {!a.publicado && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Rascunho</span>}
                        {a.video_url && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Vídeo</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { setEditando(a); setAberto(true) }} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-gray-50"><Pencil size={15} /></button>
                      <button onClick={() => excluir(a)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {aberto && <ArtigoModal artigo={editando} onClose={() => setAberto(false)} onSaved={() => { setAberto(false); carregar() }} />}
    </>
  )
}

function ArtigoModal({ artigo, onClose, onSaved }: { artigo: Artigo | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [salvando, setSalvando] = useState(false)
  const [categoria, setCategoria] = useState(artigo?.categoria ?? '')
  const [titulo, setTitulo] = useState(artigo?.titulo ?? '')
  const [conteudo, setConteudo] = useState(artigo?.conteudo ?? '')
  const [videoUrl, setVideoUrl] = useState(artigo?.video_url ?? '')
  const [ordem, setOrdem] = useState(artigo?.ordem != null ? String(artigo.ordem) : '0')
  const [publicado, setPublicado] = useState(artigo?.publicado ?? true)

  async function salvar() {
    if (!categoria.trim() || !titulo.trim()) { toast.error('Categoria e título são obrigatórios.'); return }
    setSalvando(true)
    const payload = {
      categoria: categoria.trim(), titulo: titulo.trim(), conteudo: conteudo.trim(),
      video_url: videoUrl.trim() || null, ordem: Number(ordem || 0), publicado,
      atualizado_em: new Date().toISOString(),
    }
    const sb = createClient()
    const { error } = artigo
      ? await sb.from('ajuda_artigos').update(payload).eq('id', artigo.id)
      : await sb.from('ajuda_artigos').insert(payload)
    setSalvando(false)
    if (error) { toast.error('Erro ao salvar artigo. Tente novamente.'); return }
    toast.success(artigo ? 'Artigo atualizado.' : 'Artigo criado.'); onSaved()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">{artigo ? 'Editar artigo' : 'Novo artigo'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoria</label>
              <input value={categoria} onChange={e => setCategoria(e.target.value)} className={inputCls} placeholder="Ex: Checklists" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ordem</label>
              <input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Conteúdo</label>
            <textarea value={conteudo} onChange={e => setConteudo(e.target.value)} rows={6} className={inputCls} placeholder="Texto do artigo (quebras de linha são preservadas)" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vídeo (URL — YouTube/Vimeo, opcional)</label>
            <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} className={inputCls} placeholder="https://youtu.be/..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={publicado} onChange={e => setPublicado(e.target.checked)} className="accent-orange-500" />
            Publicado (visível para as empresas)
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
