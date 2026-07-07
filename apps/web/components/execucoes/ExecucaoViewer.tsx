'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Download, Loader2, FileText, CheckCircle2, XCircle,
  ChevronRight, X, MapPin,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface Atividade { id: string; nome: string; tipo: string; secao_id: string | null; ordem: number }
interface Secao { id: string; nome: string; ordem: number }
interface RespostaItem { resposta: any; conforme: boolean | null }
interface PlanoLink { id: string; identificador: string | null; status: string; checklist_atividades: { nome: string } | null }
interface Dados {
  execucao: { id: string; resultado: string | null; data_execucao: string }
  checklist: { nome: string } | null
  secoes: Secao[]
  atividades: Atividade[]
  respostas: Record<string, RespostaItem>
  planos: PlanoLink[]
  empresa: string
  unidade: string
  executor: string
}

function dataBR(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Texto da resposta para tipos que NÃO são mídia (mídia é renderizada à parte).
function textoResposta(tipo: string, r: any): string | null {
  if (r === null || r === undefined) return '—'
  if (tipo === 'foto' || tipo === 'video' || tipo === 'assinatura') return null // mídia
  if (tipo === 'sim_nao') return (r === true || r === 'true' || r === 'sim') ? 'Sim' : 'Não'
  if (tipo === 'localizacao') return r?.endereco ?? (r?.lat != null ? `${r.lat}, ${r.lng}` : '—')
  if (tipo === 'multipla_escolha') {
    if (Array.isArray(r)) return r.map((x: any) => x?.valor ?? x).join(', ')
    if (typeof r === 'object' && r?.valor) return r.valor
  }
  if (tipo === 'catalogo') return r?.valor_chave ?? r?.valor ?? String(r)
  if (typeof r === 'object') return r?.valor ?? JSON.stringify(r)
  return String(r)
}

export function ExecucaoViewer({ execId, ambiente }: { execId: string; ambiente: 'gestao' | 'operacao' }) {
  const router = useRouter()
  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [baixando, setBaixando] = useState(false)

  useEffect(() => {
    (async () => {
      const sb = createClient()
      const { data: { session } } = await sb.auth.getSession()
      if (!session?.access_token) { setErro(true); setLoading(false); return }
      const res = await fetch(`/api/execucoes/${execId}/dados`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { setErro(true); setLoading(false); return }
      setDados(await res.json())
      setLoading(false)
    })()
  }, [execId])

  async function baixarPdf() {
    if (baixando) return
    setBaixando(true)
    const sb = createClient()
    const { data: { session } } = await sb.auth.getSession()
    if (!session?.access_token) { setBaixando(false); return }
    try {
      const res = await fetch(`/api/execucoes/${execId}/pdf`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.pdf_url) window.open(json.pdf_url, '_blank', 'noopener')
    } finally { setBaixando(false) }
  }

  function planoHref(id: string) {
    return ambiente === 'gestao' ? `/gestao/planos-acao/${id}` : `/operacao/plano/${id}`
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={26} className="animate-spin text-gray-300" /></div>
  if (erro || !dados) return (
    <div className="text-center py-20">
      <FileText size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Execução não encontrada ou sem acesso.</p>
      <button onClick={() => router.back()} className="text-xs text-orange-600 mt-3">Voltar</button>
    </div>
  )

  const aprovado = dados.execucao.resultado === 'aprovado'
  const reprovado = dados.execucao.resultado === 'reprovado'
  const atvPorSecao: Record<string, Atividade[]> = {}
  for (const a of dados.atividades) {
    const sid = a.secao_id ?? '__sem__'
    ;(atvPorSecao[sid] ??= []).push(a)
  }
  const secoesComItens = dados.secoes.filter(s => (atvPorSecao[s.id] ?? []).length > 0)
  const semSecao = atvPorSecao['__sem__'] ?? []

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-16 pt-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} /> Voltar
        </button>
        <button onClick={baixarPdf} disabled={baixando}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
          {baixando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Baixar PDF
        </button>
      </div>

      {/* Cabeçalho */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h1 className="text-base font-semibold text-gray-800">{dados.checklist?.nome ?? 'Execução'}</h1>
          {(aprovado || reprovado) && (
            <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
              aprovado ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {aprovado ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {aprovado ? 'Aprovado' : 'Reprovado'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
          <div><span className="text-gray-400 block">Executor</span><span className="text-gray-700">{dados.executor || '—'}</span></div>
          <div><span className="text-gray-400 block">Data</span><span className="text-gray-700">{dataBR(dados.execucao.data_execucao)}</span></div>
          <div><span className="text-gray-400 block">Unidade</span><span className="text-gray-700">{dados.unidade || '—'}</span></div>
        </div>
      </div>

      {/* Seções e atividades */}
      {[...secoesComItens.map(s => ({ id: s.id, nome: s.nome, atvs: atvPorSecao[s.id] })),
        ...(semSecao.length ? [{ id: '__sem__', nome: 'Atividades', atvs: semSecao }] : [])
      ].map(sec => (
        <section key={sec.id} className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{sec.nome}</p>
          <div className="space-y-2">
            {sec.atvs.map(atv => {
              const r = dados.respostas[atv.id]
              const conf = r?.conforme
              const url = (atv.tipo === 'foto' || atv.tipo === 'video' || atv.tipo === 'assinatura') ? r?.resposta?.url : null
              const txt = textoResposta(atv.tipo, r?.resposta)
              const loc = atv.tipo === 'localizacao' ? r?.resposta : null
              return (
                <div key={atv.id} className="bg-white border border-gray-200 rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-800">{atv.nome}</p>
                    {conf === true ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 flex-shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Conforme</span>
                    ) : conf === false ? (
                      <span className="flex items-center gap-1 text-xs text-red-600 flex-shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Não conforme</span>
                    ) : null}
                  </div>

                  {txt && txt !== '—' && (
                    <p className="text-sm text-gray-600 mt-1">Resposta: <span className="font-medium text-gray-800">{txt}</span></p>
                  )}

                  {loc && (loc.lat != null) && (
                    <a href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 mt-1.5">
                      <MapPin size={12} /> Ver no mapa
                    </a>
                  )}

                  {url && atv.tipo === 'video' && (
                    <video src={url} controls className="mt-2 w-full max-h-72 rounded-lg border border-gray-200 bg-black" />
                  )}
                  {url && atv.tipo !== 'video' && (
                    <button onClick={() => setLightbox(url)}
                      className="mt-2 w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:border-orange-300 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={atv.nome} className="w-full h-full object-cover" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {/* Planos de ação */}
      {dados.planos.length > 0 && (
        <section className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Planos de ação ({dados.planos.length})</p>
          <div className="space-y-2">
            {dados.planos.map(p => (
              <button key={p.id} onClick={() => router.push(planoHref(p.id))}
                className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between hover:border-orange-300 transition-colors">
                <div className="min-w-0">
                  {p.identificador && <span className="font-mono text-xs text-orange-600">{p.identificador}</span>}
                  <span className="text-sm text-gray-700 ml-2">{p.checklist_atividades?.nome ?? '—'}</span>
                </div>
                <span className="text-xs font-medium text-orange-500 flex items-center gap-0.5 flex-shrink-0">Abrir<ChevronRight size={13} /></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Lightbox de foto */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Evidência" className="max-w-full max-h-full rounded-lg" />
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Fechar"><X size={26} /></button>
        </div>
      )}
    </div>
  )
}
