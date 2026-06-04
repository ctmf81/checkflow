'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Plus, Trash2, ChevronRight, ImagePlus, Video, Eye, EyeOff, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { ImageCropModal } from '@/components/ui/ImageCropModal'

interface Etapa {
  id: string
  titulo: string | null
  conteudo: string | null
  video_id: string | null
  ordem: number
}

interface Props {
  documentoId: string
  documentoNome: string
  onClose: () => void
}

export function EtapasModal({ documentoId, documentoNome, onClose }: Props) {
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [busca, setBusca] = useState('')
  const [etapaAtiva, setEtapaAtiva] = useState<Etapa | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [preview, setPreview] = useState(false)
  const [imagensEtapas, setImagensEtapas] = useState<Record<string, { id: string; url: string }[]>>({})
  const [carrosselIdx, setCarrosselIdx] = useState<Record<string, number>>({})

  // Form da etapa ativa
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [videoId, setVideoId] = useState('')

  // Imagens
  const inputImgRef = useRef<HTMLInputElement>(null)
  const [imagens, setImagens] = useState<{ id?: string; url: string; blob?: Blob }[]>([])
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  async function carregarEtapas() {
    const supabase = createClient()
    const { data } = await supabase.from('documento_etapas')
      .select('id, titulo, conteudo, video_id, ordem')
      .eq('documento_id', documentoId).order('ordem')
    if (data) {
      setEtapas(data)
      // Carrega imagens de todas as etapas
      const imgs: Record<string, { id: string; url: string }[]> = {}
      await Promise.all(data.map(async e => {
        const { data: ei } = await supabase.from('etapa_imagens').select('id, url, ordem').eq('etapa_id', e.id).order('ordem')
        if (ei) imgs[e.id] = ei
      }))
      setImagensEtapas(imgs)
    }
    setLoading(false)
  }

  useEffect(() => { carregarEtapas() }, [documentoId])

  function abrirEtapa(etapa: Etapa) {
    setEtapaAtiva(etapa)
    setTitulo(etapa.titulo ?? '')
    setConteudo(etapa.conteudo ?? '')
    setVideoId(etapa.video_id ?? '')
    setImagens([])
    // carrega imagens da etapa
    createClient().from('etapa_imagens').select('id, url, ordem')
      .eq('etapa_id', etapa.id).order('ordem')
      .then(({ data }) => {
        if (data) setImagens(data.map(i => ({ id: i.id, url: i.url })))
      })
  }

  async function criarEtapa() {
    const ordem = etapas.length
    const { data } = await createClient().from('documento_etapas')
      .insert({ documento_id: documentoId, titulo: `Passo ${ordem + 1}`, ordem })
      .select('id, titulo, conteudo, video_id, ordem').single()
    if (data) {
      setEtapas(prev => [...prev, data])
      abrirEtapa(data)
    }
  }

  async function deletarEtapa(id: string) {
    if (!confirm('Remover esta etapa?')) return
    await createClient().from('documento_etapas').delete().eq('id', id)
    setEtapas(prev => prev.filter(e => e.id !== id))
    if (etapaAtiva?.id === id) setEtapaAtiva(null)
  }

  async function salvarEtapa() {
    if (!etapaAtiva) return
    setSalvando(true)
    const supabase = createClient()

    await supabase.from('documento_etapas').update({
      titulo: titulo || null, conteudo: conteudo || null, video_id: videoId || null
    }).eq('id', etapaAtiva.id)

    // Upload imagens novas
    for (const img of imagens.filter(i => i.blob)) {
      const path = `etapas/${etapaAtiva.id}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('empresas').upload(path, img.blob!, { contentType: 'image/jpeg' })
      if (!error) {
        const { data: pub } = supabase.storage.from('empresas').getPublicUrl(path)
        await supabase.from('etapa_imagens').insert({ etapa_id: etapaAtiva.id, url: pub.publicUrl, ordem: imagens.indexOf(img) })
      }
    }

    setEtapas(prev => prev.map(e => e.id === etapaAtiva.id
      ? { ...e, titulo: titulo || null, conteudo: conteudo || null, video_id: videoId || null }
      : e
    ))
    setSalvando(false)
    setEtapaAtiva(null) // volta para a lista
  }

  async function removerImagem(idx: number) {
    const img = imagens[idx]
    if (img.id) await createClient().from('etapa_imagens').delete().eq('id', img.id)
    setImagens(prev => prev.filter((_, i) => i !== idx))
  }

  function handleFileImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const filtradas = etapas.filter(e =>
    !busca || (e.titulo ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <h2 className="font-semibold text-gray-800 truncate">{documentoNome}</h2>
            <div className="flex items-center gap-2">
              {!etapaAtiva && (
                <button onClick={() => setPreview(!preview)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-500 transition-colors px-2 py-1 rounded-lg hover:bg-orange-50">
                  {preview ? <EyeOff size={15} /> : <Eye size={15} />}
                  {preview ? 'Editar' : 'Preview'}
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
          </div>

          {!etapaAtiva && preview ? (
            /* MODO PREVIEW — todas as etapas empilhadas */
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
              {etapas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhuma etapa cadastrada.</p>
              ) : etapas.map((etapa, idx) => {
                const imgs = imagensEtapas[etapa.id] ?? []
                const carIdx = carrosselIdx[etapa.id] ?? 0
                return (
                  <div key={etapa.id} className="border border-gray-100 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="bg-orange-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                      {etapa.titulo && <h3 className="font-semibold text-gray-800">{etapa.titulo}</h3>}
                    </div>

                    {etapa.conteudo && (
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{etapa.conteudo}</p>
                    )}

                    {etapa.video_id && etapa.video_id.length === 11 && (
                      <div className="rounded-lg overflow-hidden aspect-video">
                        <iframe src={`https://www.youtube.com/embed/${etapa.video_id}`}
                          title={etapa.titulo ?? `Etapa ${idx + 1}`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen className="w-full h-full" />
                      </div>
                    )}

                    {imgs.length > 0 && (
                      <div className="relative">
                        <div className="rounded-lg overflow-hidden border border-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imgs[carIdx].url} alt="" className="w-full object-contain max-h-64" />
                        </div>
                        {imgs.length > 1 && (
                          <div className="flex items-center justify-between mt-2">
                            <button onClick={() => setCarrosselIdx(p => ({ ...p, [etapa.id]: Math.max(0, carIdx - 1) }))}
                              disabled={carIdx === 0}
                              className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-colors">
                              <ChevronLeft size={16} />
                            </button>
                            <span className="text-xs text-gray-400">{carIdx + 1} / {imgs.length}</span>
                            <button onClick={() => setCarrosselIdx(p => ({ ...p, [etapa.id]: Math.min(imgs.length - 1, carIdx + 1) }))}
                              disabled={carIdx === imgs.length - 1}
                              className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-colors">
                              <ChevronRightIcon size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : !etapaAtiva ? (
            /* Lista de etapas */
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pesquisar por nome</label>
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar valor"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div className="pt-6">
                  <Button onClick={criarEtapa} size="sm"><Plus size={14} />Criar</Button>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
              ) : filtradas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhuma etapa. Clique em Criar para adicionar.</p>
              ) : (
                <div className="space-y-2">
                  {filtradas.map(etapa => (
                    <div key={etapa.id} className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-50 border border-gray-100 group">
                      <button onClick={() => abrirEtapa(etapa)} className="flex-1 text-left">
                        <span className="font-medium text-gray-800 text-sm">{etapa.titulo || `Etapa ${etapa.ordem + 1}`}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <button onClick={() => abrirEtapa(etapa)} className="text-gray-400 hover:text-orange-500">
                          <ChevronRight size={16} />
                        </button>
                        <button onClick={() => deletarEtapa(etapa.id)} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : etapaAtiva ? (
            /* Editor da etapa */
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <button onClick={() => setEtapaAtiva(null)} className="text-sm text-orange-500 hover:underline">
                ← Voltar para lista
              </button>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título da Sessão</label>
                <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="digite o título"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo da etapa</label>
                <textarea value={conteudo} onChange={e => setConteudo(e.target.value)}
                  placeholder="Conteúdo em texto" rows={4}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                  <Video size={15} className="text-red-500" />Link de Vídeo
                </label>
                <input
                  value={videoId}
                  onChange={e => {
                    const v = e.target.value.trim()
                    // Extrai o ID de qualquer formato de URL do YouTube
                    const match =
                      v.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/) ||
                      v.match(/^([A-Za-z0-9_-]{11})$/)
                    setVideoId(match ? match[1] : v)
                  }}
                  placeholder="Cole a URL ou o ID do vídeo"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
                {videoId && videoId.length === 11 && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 aspect-video">
                    <iframe
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title="Preview"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                )}
                {videoId && videoId.length !== 11 && (
                  <p className="text-xs text-amber-600 mt-1">URL inválida. Cole o link completo do YouTube.</p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                  <ImagePlus size={15} className="text-gray-400" />Imagens (carrossel)
                </label>
                <input ref={inputImgRef} type="file" accept="image/*" className="hidden" onChange={handleFileImagem} />
                <div className="flex gap-2 flex-wrap">
                  {imagens.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removerImagem(idx)}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={16} className="text-white" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => inputImgRef.current?.click()}
                    className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-orange-300 transition-colors text-xs gap-1">
                    <ImagePlus size={20} />Adicionar
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setEtapaAtiva(null)} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
                <Button onClick={salvarEtapa} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          onConfirm={blob => {
            setImagens(prev => [...prev, { url: URL.createObjectURL(blob), blob }])
            setCropSrc(null)
          }}
          onClose={() => setCropSrc(null)}
        />
      )}
    </>
  )
}
