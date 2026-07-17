'use client'

import { useEffect, useState, use, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, BarChart2, Image as ImageIcon, MapPin, Loader2, X, Check,
  ChevronDown, ChevronRight, Play, User, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface Item { id: string; titulo: string; ordem: number }
interface Resp {
  item_id: string; feito: boolean; observacao: string | null
  evidencia_url: string | null; evidencia_tipo: 'foto' | 'video' | null
  lat: number | null; lng: number | null; respondido_em: string
}
interface Exec { id: string; nome: string; status: string; aberta_em: string; respostas: Resp[] }

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

// ─── Carregador do Leaflet (CDN, uma vez) ───────────────────────────────────
let leafletPromise: Promise<any> | null = null
function carregarLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem window'))
  if ((window as any).L) return Promise.resolve((window as any).L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(css)
    const js = document.createElement('script')
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    js.async = true
    js.onload = () => resolve((window as any).L)
    js.onerror = () => reject(new Error('falha ao carregar o mapa'))
    document.body.appendChild(js)
  })
  return leafletPromise
}

// ─── Endereço a partir do check-in (geocodificação reversa OSM/Nominatim) ────
const enderecoCache = new Map<string, string>()
async function buscarEndereco(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`
  if (enderecoCache.has(key)) return enderecoCache.get(key)!
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
      { headers: { Accept: 'application/json' } },
    )
    const data = await res.json()
    const end = data?.display_name || `${lat}, ${lng}`
    enderecoCache.set(key, end)
    return end
  } catch {
    return `${lat}, ${lng}`
  }
}

function EnderecoModal({ lat, lng, onClose }: { lat: number; lng: number; onClose: () => void }) {
  const [endereco, setEndereco] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    buscarEndereco(lat, lng).then(e => { if (vivo) setEndereco(e) })
    return () => { vivo = false }
  }, [lat, lng])
  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><MapPin size={15} className="text-orange-500" /> Localização do check-in</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">
          {endereco === null ? (
            <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Buscando endereço...</p>
          ) : (
            <p className="text-sm text-gray-700">{endereco}</p>
          )}
          <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-3">
            <MapPin size={12} /> Ver no mapa
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Aba do mapa ────────────────────────────────────────────────────────────
function MapaTarefas({ pontos }: { pontos: { lat: number; lng: number; pessoa: string; item: string; hora: string }[] }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (pontos.length === 0) return
    let cancelado = false
    carregarLeaflet().then((L) => {
      if (cancelado || !ref.current || mapRef.current) return
      const map = L.map(ref.current)
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)
      const latlngs: [number, number][] = []
      for (const p of pontos) {
        latlngs.push([p.lat, p.lng])
        L.circleMarker([p.lat, p.lng], {
          radius: 8, color: '#ea580c', fillColor: '#fb923c', fillOpacity: 0.85, weight: 2,
        }).addTo(map).bindPopup(
          `<b>${escapeHtml(p.pessoa)}</b><br>${escapeHtml(p.item)}<br><span style="color:#888">${escapeHtml(p.hora)}</span>`,
        )
      }
      if (latlngs.length === 1) map.setView(latlngs[0], 16)
      else map.fitBounds(latlngs, { padding: [40, 40] })
    }).catch(() => { if (!cancelado) setErro(true) })
    return () => {
      cancelado = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [pontos])

  if (pontos.length === 0) {
    return <div className="py-20 text-center text-sm text-gray-400">Nenhuma resposta com localização (check-in).</div>
  }
  if (erro) {
    return (
      <div className="space-y-2 py-4">
        <p className="text-sm text-amber-600 mb-3">Não foi possível carregar o mapa. Pontos com localização:</p>
        {pontos.map((p, i) => (
          <a key={i} href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-blue-600 hover:bg-gray-50">
            <MapPin size={14} /> {p.pessoa} · {p.item} <span className="text-gray-400">· {p.hora}</span>
          </a>
        ))}
      </div>
    )
  }
  return <div ref={ref} className="w-full h-[70vh] rounded-xl border border-gray-200 overflow-hidden" />
}

// ─── Página ─────────────────────────────────────────────────────────────────
export default function IndicadoresTarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [titulo, setTitulo] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  const [execs, setExecs] = useState<Exec[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'resumo' | 'evidencias' | 'mapa'>('resumo')
  const [lightbox, setLightbox] = useState<{ url: string; tipo: 'foto' | 'video' } | null>(null)
  const [enderecoAlvo, setEnderecoAlvo] = useState<{ lat: number; lng: number } | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [erroPdf, setErroPdf] = useState('')

  async function gerarPdf() {
    setGerandoPdf(true)
    setErroPdf('')
    try {
      const sb = createClient()
      const { data: { session } } = await sb.auth.getSession()
      if (!session?.access_token) { setErroPdf('Sessão expirada. Recarregue a página.'); setGerandoPdf(false); return }
      const res = await fetch(`/api/tarefas/${id}/pdf`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { setErroPdf('Não foi possível gerar o relatório.'); setGerandoPdf(false); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-tarefas-${titulo || 'lista'}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setErroPdf('Não foi possível gerar o relatório.')
    }
    setGerandoPdf(false)
  }

  useEffect(() => { carregar() }, [id])
  async function carregar() {
    setLoading(true)
    const sb = createClient()
    const [listaRes, itensRes, execRes] = await Promise.all([
      sb.from('tarefa_listas').select('titulo').eq('id', id).single(),
      sb.from('tarefa_itens').select('id, titulo, ordem').eq('lista_id', id).order('ordem'),
      sb.from('tarefa_execucoes')
        .select('id, status, aberta_em, usuario:usuario_id(nome), respostas:tarefa_respostas(item_id, feito, observacao, evidencia_url, evidencia_tipo, lat, lng, respondido_em)')
        .eq('lista_id', id).order('aberta_em', { ascending: false }),
    ])
    setTitulo((listaRes.data as any)?.titulo ?? 'Lista de tarefas')
    setItens((itensRes.data as any) ?? [])
    setExecs(((execRes.data as any) ?? []).map((e: any) => ({
      id: e.id, status: e.status, aberta_em: e.aberta_em,
      nome: (Array.isArray(e.usuario) ? e.usuario[0] : e.usuario)?.nome ?? '—',
      respostas: e.respostas ?? [],
    })))
    setLoading(false)
  }

  const tituloItem = useMemo(() => {
    const m = new Map<string, string>()
    itens.forEach(i => m.set(i.id, i.titulo))
    return m
  }, [itens])

  // Feito × não-feito por tarefa (denominador = nº de execuções/pessoas)
  const statsPorItem = useMemo(() => {
    const total = execs.length
    return itens.map(it => {
      const feito = execs.reduce((n, e) => n + (e.respostas.some(r => r.item_id === it.id && r.feito) ? 1 : 0), 0)
      return { id: it.id, titulo: it.titulo, feito, naoFeito: total - feito, total }
    })
  }, [itens, execs])

  const evidencias = useMemo(() => execs.flatMap(e =>
    e.respostas.filter(r => r.evidencia_url).map(r => ({
      url: r.evidencia_url!, tipo: (r.evidencia_tipo ?? 'foto') as 'foto' | 'video',
      pessoa: e.nome, item: tituloItem.get(r.item_id) ?? 'Item', hora: fmt(r.respondido_em),
      lat: r.lat, lng: r.lng,
    })),
  ), [execs, tituloItem])

  const pontos = useMemo(() => execs.flatMap(e =>
    e.respostas.filter(r => r.lat != null && r.lng != null).map(r => ({
      lat: r.lat!, lng: r.lng!, pessoa: e.nome,
      item: tituloItem.get(r.item_id) ?? 'Item', hora: fmt(r.respondido_em),
    })),
  ), [execs, tituloItem])

  // Conclusão média (% de tarefas feitas por pessoa)
  const conclusaoMedia = useMemo(() => {
    if (execs.length === 0 || itens.length === 0) return 0
    const soma = execs.reduce((acc, e) => {
      const feitos = itens.filter(it => e.respostas.some(r => r.item_id === it.id && r.feito)).length
      return acc + feitos / itens.length
    }, 0)
    return Math.round((soma / execs.length) * 100)
  }, [execs, itens])

  const ABAS = [
    { id: 'resumo' as const, label: 'Resumo', icon: BarChart2 },
    { id: 'evidencias' as const, label: `Evidências${evidencias.length ? ` (${evidencias.length})` : ''}`, icon: ImageIcon },
    { id: 'mapa' as const, label: `Mapa${pontos.length ? ` (${pontos.length})` : ''}`, icon: MapPin },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/gestao/tarefas" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
        <ChevronLeft size={16} /> Voltar
      </Link>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Indicadores</h1>
          <p className="text-sm text-gray-400">{titulo}</p>
        </div>
        <button onClick={gerarPdf} disabled={gerandoPdf || loading || execs.length === 0}
          title={execs.length === 0 ? 'Sem respostas para gerar o relatório' : 'Gerar relatório em PDF'}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex-shrink-0">
          {gerandoPdf ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          {gerandoPdf ? 'Gerando...' : 'Relatório PDF'}
        </button>
      </div>
      {erroPdf && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{erroPdf}</p>}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400">Respostas</p>
          <p className="text-2xl font-semibold text-gray-800">{execs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400">Conclusão média</p>
          <p className="text-2xl font-semibold text-gray-800">{conclusaoMedia}%</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400">Tarefas</p>
          <p className="text-2xl font-semibold text-gray-800">{itens.length}</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {ABAS.map(a => {
          const Icon = a.icon
          return (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === a.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <Icon size={15} /> {a.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
      ) : execs.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-400">Ninguém respondeu ainda.</div>
      ) : (
        <>
          {/* ── RESUMO ── */}
          {aba === 'resumo' && (
            <div className="space-y-6">
              {/* Gráfico por tarefa */}
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Feito × não feito por tarefa</h2>
                <div className="space-y-3 bg-white rounded-xl border border-gray-200 p-4">
                  {statsPorItem.map(s => {
                    const pct = s.total > 0 ? Math.round((s.feito / s.total) * 100) : 0
                    return (
                      <div key={s.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-700 truncate pr-2">{s.titulo}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{s.feito}/{s.total} · {pct}%</span>
                        </div>
                        <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                          <div className="bg-green-500" style={{ width: `${pct}%` }} title={`${s.feito} feito(s)`} />
                          <div className="bg-red-300" style={{ width: `${100 - pct}%` }} title={`${s.naoFeito} não feito(s)`} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Feito</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-300" /> Não feito</span>
                </div>
              </section>

              {/* Por pessoa (expansível) */}
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Por pessoa</h2>
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
                  {execs.map(e => {
                    const feitos = itens.filter(it => e.respostas.some(r => r.item_id === it.id && r.feito)).length
                    const aberto = expandido === e.id
                    return (
                      <div key={e.id}>
                        <button onClick={() => setExpandido(aberto ? null : e.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                          {aberto ? <ChevronDown size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />}
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <User size={15} className="text-gray-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{e.nome}</p>
                            <p className="text-xs text-gray-400">{fmt(e.aberta_em)}</p>
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0">{feitos}/{itens.length} feitas</span>
                          {e.status === 'encerrada'
                            ? <span className="flex items-center gap-1 text-xs text-green-600 flex-shrink-0"><Check size={12} />encerrada</span>
                            : <span className="text-xs text-blue-500 flex-shrink-0">em andamento</span>}
                        </button>
                        {aberto && (
                          <div className="px-4 pb-3 pl-14 space-y-2">
                            {itens.map(it => {
                              const r = e.respostas.find(x => x.item_id === it.id)
                              const feito = !!r?.feito
                              return (
                                <div key={it.id} className="flex items-start gap-2 text-sm">
                                  <span className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${feito ? 'bg-green-500' : 'bg-gray-200'}`}>
                                    {feito && <Check size={11} className="text-white" />}
                                  </span>
                                  <div className="min-w-0">
                                    <span className={feito ? 'text-gray-700' : 'text-gray-400'}>{it.titulo}</span>
                                    {r?.observacao && <p className="text-xs text-gray-500 mt-0.5">“{r.observacao}”</p>}
                                    <div className="flex items-center gap-3 mt-1">
                                      {r?.evidencia_url && (
                                        <button onClick={() => setLightbox({ url: r.evidencia_url!, tipo: r.evidencia_tipo ?? 'foto' })}
                                          className="text-xs text-orange-600 hover:underline flex items-center gap-1">
                                          <ImageIcon size={12} /> evidência
                                        </button>
                                      )}
                                      {r?.lat != null && (
                                        <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer"
                                          className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                          <MapPin size={12} /> local
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          )}

          {/* ── EVIDÊNCIAS ── */}
          {aba === 'evidencias' && (
            evidencias.length === 0 ? (
              <div className="py-20 text-center text-sm text-gray-400">Nenhuma evidência enviada.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {evidencias.map((ev, i) => (
                  <div key={i} className="group text-left">
                    <div className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                      <button onClick={() => setLightbox({ url: ev.url, tipo: ev.tipo })} className="block w-full h-full">
                        {ev.tipo === 'video' ? (
                          <>
                            <video src={ev.url} className="w-full h-full object-cover" muted preload="metadata" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Play size={26} className="text-white" fill="white" />
                            </span>
                          </>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ev.url} alt={ev.item} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        )}
                      </button>
                      {ev.lat != null && ev.lng != null && (
                        <button onClick={() => setEnderecoAlvo({ lat: ev.lat!, lng: ev.lng! })}
                          title="Ver localização do check-in"
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-orange-600 hover:bg-white transition-colors">
                          <MapPin size={14} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs font-medium text-gray-700 truncate mt-1">{ev.pessoa}</p>
                    <p className="text-xs text-gray-400 truncate">{ev.item}</p>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── MAPA ── */}
          {aba === 'mapa' && <MapaTarefas pontos={pontos} />}
        </>
      )}

      {/* Modal de endereço (check-in) */}
      {enderecoAlvo && (
        <EnderecoModal lat={enderecoAlvo.lat} lng={enderecoAlvo.lng} onClose={() => setEnderecoAlvo(null)} />
      )}

      {/* Lightbox de mídia */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}><X size={26} /></button>
          {lightbox.tipo === 'video' ? (
            <video src={lightbox.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" onClick={e => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightbox.url} alt="" className="max-w-full max-h-[85vh] rounded-lg object-contain" onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  )
}
