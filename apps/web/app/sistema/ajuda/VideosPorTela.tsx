'use client'

import { useEffect, useState } from 'react'
import { Plus, Video, Pencil, Trash2, Loader2, X, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast, useConfirm } from '@/components/ui/feedback'
import { embedUrlVideo, normalizarRota } from '@/lib/ajudaVideos'

// Cadastro dos vídeos tutoriais por tela. O assistente de ajuda mostra o ícone
// de vídeo somente nas telas que têm um vídeo ativo aqui.

interface VideoTela {
  id: string
  rota: string
  titulo: string | null
  url: string
  ativo: boolean
}

export function VideosPorTela() {
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<VideoTela[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<VideoTela | null>(null)
  const [aberto, setAberto] = useState(false)

  async function carregar() {
    setLoading(true)
    const { data } = await createClient().from('ajuda_videos').select('*').order('rota')
    setRows((data ?? []) as VideoTela[])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  async function excluir(v: VideoTela) {
    if (!await confirm({ titulo: `Excluir o vídeo de ${v.rota}?`, mensagem: 'O ícone de vídeo deixa de aparecer nessa tela.', confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('ajuda_videos').delete().eq('id', v.id)
    if (error) { toast.error('Erro ao excluir o vídeo. Tente novamente.'); return }
    toast.success('Vídeo excluído.'); carregar()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Vídeo tutorial por tela. O ícone de vídeo aparece no assistente de ajuda apenas nas telas cadastradas aqui.
        </p>
        <Button size="sm" onClick={() => { setEditando(null); setAberto(true) }}><Plus size={14} /> Novo</Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <Video size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum vídeo cadastrado.</p>
          <p className="text-xs text-gray-400 mt-1">Cadastre a rota da tela (ex.: /gestao/checklists) e o link do YouTube ou Google Drive.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(v => {
            const embed = embedUrlVideo(v.url)
            return (
              <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{v.titulo || 'Vídeo tutorial'}</span>
                    <code className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{v.rota}</code>
                    {!v.ativo && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Inativo</span>}
                    {!embed && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Link não reconhecido</span>}
                  </div>
                  <a href={v.url} target="_blank" rel="noreferrer"
                    className="text-xs text-gray-400 hover:text-orange-500 inline-flex items-center gap-1 mt-0.5 truncate max-w-full">
                    {v.url}<ExternalLink size={11} className="flex-shrink-0" />
                  </a>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditando(v); setAberto(true) }} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-gray-50"><Pencil size={15} /></button>
                  <button onClick={() => excluir(v)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"><Trash2 size={15} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {aberto && <VideoModal video={editando} onClose={() => setAberto(false)} onSaved={() => { setAberto(false); carregar() }} />}
    </>
  )
}

function VideoModal({ video, onClose, onSaved }: { video: VideoTela | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [salvando, setSalvando] = useState(false)
  const [rota, setRota] = useState(video?.rota ?? '')
  const [titulo, setTitulo] = useState(video?.titulo ?? '')
  const [url, setUrl] = useState(video?.url ?? '')
  const [ativo, setAtivo] = useState(video?.ativo ?? true)

  const rotaNormalizada = normalizarRota(rota)
  const embed = embedUrlVideo(url)

  async function salvar() {
    if (!rotaNormalizada) { toast.error('Informe a rota da tela (ex.: /gestao/checklists).'); return }
    if (!embed) { toast.error('Link não reconhecido. Use um link do YouTube ou do Google Drive.'); return }
    setSalvando(true)
    const payload = {
      rota: rotaNormalizada, titulo: titulo.trim() || null, url: url.trim(), ativo,
      atualizado_em: new Date().toISOString(),
    }
    const sb = createClient()
    const { error } = video
      ? await sb.from('ajuda_videos').update(payload).eq('id', video.id)
      : await sb.from('ajuda_videos').insert(payload)
    setSalvando(false)
    if (error) {
      // Índice único em `rota`: uma tela = um vídeo.
      toast.error(error.code === '23505'
        ? 'Já existe um vídeo cadastrado para essa rota. Edite o existente.'
        : 'Erro ao salvar o vídeo. Tente novamente.')
      return
    }
    toast.success(video ? 'Vídeo atualizado.' : 'Vídeo cadastrado.'); onSaved()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">{video ? 'Editar vídeo da tela' : 'Novo vídeo por tela'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rota da tela</label>
            <input value={rota} onChange={e => setRota(e.target.value)} className={inputCls}
              placeholder="/gestao/checklists — ou cole a URL completa da página" />
            {rotaNormalizada && rotaNormalizada !== rota.trim() && (
              <p className="text-[11px] text-gray-400 mt-1">Vai ser salva como <code className="text-gray-600">{rotaNormalizada}</code></p>
            )}
            <p className="text-[11px] text-gray-400 mt-1">
              As telas filhas herdam o vídeo (ex.: <code>/gestao/checklists</code> vale para <code>/gestao/checklists/123</code>).
              Pra id no meio, use <code>[id]</code> ou <code>*</code> — ex.: <code>/gestao/grupos/[id]/subgrupos</code>.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} className={inputCls} placeholder="Ex: Como criar um checklist" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Link do vídeo (YouTube ou Google Drive)</label>
            <input value={url} onChange={e => setUrl(e.target.value)} className={inputCls} placeholder="https://youtu.be/... ou https://drive.google.com/file/d/.../view" />
            {url.trim() && !embed && (
              <p className="text-[11px] text-red-500 mt-1">Link não reconhecido. Use YouTube ou Google Drive.</p>
            )}
          </div>

          {embed && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Prévia</p>
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
                <iframe src={embed} className="w-full h-full" allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                No Google Drive, o arquivo precisa estar compartilhado como &quot;qualquer pessoa com o link&quot;.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-orange-500" />
            Ativo (ícone visível na tela)
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
