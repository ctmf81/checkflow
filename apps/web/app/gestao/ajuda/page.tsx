'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, BookOpen, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface Artigo {
  id: string
  categoria: string
  titulo: string
  conteudo: string
  video_url: string | null
}

// Converte URLs comuns do YouTube em URL de embed
function embedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
      if (u.pathname.startsWith('/embed/')) return url
    }
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    if (u.hostname.includes('vimeo.com')) return `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean).pop()}`
    return url
  } catch { return null }
}

export default function AjudaPage() {
  const router = useRouter()
  const [artigos, setArtigos] = useState<Artigo[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await createClient().from('ajuda_artigos')
        .select('id, categoria, titulo, conteudo, video_url')
        .eq('publicado', true).order('categoria').order('ordem')
      setArtigos((data ?? []) as Artigo[])
      setLoading(false)
    })()
  }, [])

  const filtrados = busca
    ? artigos.filter(a => (a.titulo + a.conteudo + a.categoria).toLowerCase().includes(busca.toLowerCase()))
    : artigos
  const categorias = Array.from(new Set(filtrados.map(a => a.categoria)))

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <button onClick={() => router.push('/gestao')} className="text-gray-400 hover:text-orange-500"><ChevronLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-800">Central de ajuda</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5 ml-9">Guias e vídeos rápidos. Não achou? Use o assistente de IA no canto da tela.</p>

      <div className="relative mb-6">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar na ajuda…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200" />
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-16 text-center">
          <BookOpen size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum artigo encontrado.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categorias.map(cat => (
            <div key={cat}>
              <h2 className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-2">{cat}</h2>
              <div className="space-y-2">
                {filtrados.filter(a => a.categoria === cat).map(a => {
                  const open = aberto === a.id
                  const embed = a.video_url ? embedUrl(a.video_url) : null
                  return (
                    <div key={a.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <button onClick={() => setAberto(open ? null : a.id)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                        <span className="text-sm font-medium text-gray-800">{a.titulo}</span>
                        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                      </button>
                      {open && (
                        <div className="px-4 pb-4 space-y-3">
                          {a.conteudo && <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{a.conteudo}</p>}
                          {embed && (
                            <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                              <iframe src={embed} className="absolute inset-0 w-full h-full rounded-lg border border-gray-100"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
