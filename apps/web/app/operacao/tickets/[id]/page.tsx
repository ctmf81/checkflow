'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Upload, AlertTriangle, Loader2, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { notificarTicket } from '@/lib/notificacoes'
import { registrarUsoArmazenamento } from '@/lib/uso'
import { acoesDisponiveis as calcularAcoes, type Acao } from '@/lib/tickets'

type TicketStatus =
  | 'aberto' | 'em_tratamento' | 'aguardando_informacao'
  | 'aguardando_validacao' | 'corrigido' | 'nao_corrigido'
  | 'corrigido_parcialmente' | 'cancelado' | 'improcedente'

interface Ticket {
  id: string; numero: number; titulo: string; descricao: string
  prioridade: string; status: TicketStatus; criado_em: string
  unidade_id: string; grupo_id: string; subgrupo_id: string
  grupo: { nome: string }; subgrupo: { nome: string }
  categoria: { nome: string } | null
  aberto_por: { id: string; nome: string }
  assignee: { id: string; nome: string } | null
}

interface Evento {
  id: string; tipo: string; texto: string; criado_em: string
  autor: { nome: string }
  evidencias: { id: string; url: string; tipo: string; nome: string | null }[]
}

const TIPO_EVENTO: Record<string, { label: string; cor: string }> = {
  abertura:           { label: 'Ticket aberto',              cor: 'text-blue-600' },
  aceite:             { label: 'Assumido',                   cor: 'text-purple-600' },
  comentario:         { label: 'Comentário',                 cor: 'text-gray-600' },
  devolucao:          { label: 'Devolvido para informação',  cor: 'text-yellow-600' },
  resposta_devolucao: { label: 'Resposta enviada',           cor: 'text-blue-500' },
  transferencia:      { label: 'Transferido',                cor: 'text-indigo-600' },
  conclusao:          { label: 'Concluído',                  cor: 'text-green-600' },
  validacao:          { label: 'Validado',                   cor: 'text-green-600' },
  reabertura:         { label: 'Reaberto',                   cor: 'text-red-500' },
  cancelamento:       { label: 'Cancelado',                  cor: 'text-gray-400' },
  improcedencia:      { label: 'Improcedente',               cor: 'text-gray-400' },
}

const PRIORIDADE_COR: Record<string, string> = {
  critica: 'bg-red-500 text-white',
  alta:    'bg-orange-400 text-white',
  media:   'bg-yellow-400 text-gray-800',
  baixa:   'bg-green-400 text-white',
}

function formatarTempo(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function TicketDetalheOperacao() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { empresaAtiva, grupoLabel, subgrupoLabel } = useSession()
  const supabase = createClient()
  const endRef = useRef<HTMLDivElement>(null)

  const [ticket,  setTicket]  = useState<Ticket | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [userId,  setUserId]  = useState<string | null>(null)
  const [podeCancelar, setPodeCancelar] = useState(false)
  const [meusSubgrupos, setMeusSubgrupos] = useState<Set<string>>(new Set())

  const [texto,    setTexto]    = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro,     setErro]     = useState<string | null>(null)
  // Ação documentada escolhida (comentar/concluir/devolver…) aguardando a
  // observação. Assumir não passa por aqui — é executada com um toque.
  const [acaoSel,  setAcaoSel]  = useState<Acao | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUserId(u?.id ?? null)
      if (u) {
        const { data: us } = await supabase.from('usuario_subgrupo').select('subgrupo_id').eq('usuario_id', u.id)
        setMeusSubgrupos(new Set((us ?? []).map((r: any) => r.subgrupo_id)))
      }
    })
    supabase.rpc('usuario_tem_permissao', { p_recurso: 'ticket', p_acao: 'cancelar' })
      .then(({ data }) => setPodeCancelar(!!data))
  }, [empresaAtiva?.id])

  async function carregar() {
    const [{ data: t }, { data: ev }] = await Promise.all([
      supabase.from('tickets').select(`
        id, numero, titulo, descricao, prioridade, status, criado_em,
        unidade_id, grupo_id, subgrupo_id,
        grupo:grupos(nome), subgrupo:subgrupos(nome),
        categoria:ticket_categorias(nome),
        aberto_por:usuarios!tickets_aberto_por_id_fkey(id, nome),
        assignee:usuarios!tickets_assignee_id_fkey(id, nome)
      `).eq('id', id).single(),
      supabase.from('ticket_eventos').select(`
        id, tipo, texto, criado_em,
        autor:usuarios(nome),
        evidencias:ticket_evidencias(id, url, tipo, nome)
      `).eq('ticket_id', id).order('criado_em', { ascending: true }),
    ])
    setTicket(t as any)
    setEventos((ev as any) ?? [])
    setLoading(false)
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  useEffect(() => { if (id) carregar() }, [id])

  const ehAssignee   = ticket?.assignee?.id === userId
  const ehAbridor    = ticket?.aberto_por?.id === userId
  const ehDoSubgrupo = !!ticket && meusSubgrupos.has(ticket.subgrupo_id)

  function acoes(): Acao[] {
    if (!ticket) return []
    return calcularAcoes({
      status: ticket.status, ehDoSubgrupo, ehAssignee, ehAbridor, podeCancelar,
      grupoLabel, subgrupoLabel,
    }).filter(a => a.tipo !== 'transferencia') // transferência fica só na gestão
  }

  async function executarAcao(acao: Acao) {
    // Assumir é um toque só: não exige observação nem evidência. As demais
    // ações (comentar, concluir, devolver…) documentam e exigem observação.
    const semObs = acao.tipo === 'aceite'
    if (!semObs && !texto.trim()) { setErro('Observação obrigatória.'); return }
    const textoEvento = texto.trim() || (semObs ? 'Ticket assumido' : '')
    setEnviando(true); setErro(null)

    if (acao.tipo === 'aceite' || acao.novoStatus !== ticket!.status) {
      const patch: Record<string, any> =
        acao.tipo === 'aceite'     ? { assignee_id: userId, status: acao.novoStatus } :
        acao.tipo === 'reabertura' ? { assignee_id: null,   status: acao.novoStatus } :
                                     { status: acao.novoStatus }

      const { data: atualizado, error: upErr } = await supabase
        .from('tickets').update(patch).eq('id', id).select('id')

      if (upErr || !atualizado || atualizado.length === 0) {
        setEnviando(false)
        setErro('Você não tem permissão para executar esta ação.')
        return
      }
    }

    const { data: evento, error: evErr } = await supabase.from('ticket_eventos').insert({
      ticket_id: id, tipo: acao.tipo, texto: textoEvento,
    }).select('id').single()

    if (evErr) { setEnviando(false); setErro('Não foi possível registrar o evento.'); carregar(); return }

    if (evento) {
      for (const file of arquivos) {
        const ext  = file.name.split('.').pop()
        const path = `tickets/${id}/${Date.now()}.${ext}`
        const { data: up } = await supabase.storage.from('execucoes').upload(path, file, { upsert: false })
        if (up) {
          registrarUsoArmazenamento(empresaAtiva?.id, 'ticket', file.size)
          const { data: pub } = supabase.storage.from('execucoes').getPublicUrl(path)
          const tipo = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'foto' : 'documento'
          await supabase.from('ticket_evidencias').insert({
            ticket_id: id, evento_id: evento.id, url: pub.publicUrl, tipo, nome: file.name,
          })
        }
      }
    }

    if (userId) notificarTicket({ ticket_id: id, evento: acao.tipo, ator_id: userId, texto: textoEvento })

    setTexto(''); setArquivos([]); setAcaoSel(null); setEnviando(false)
    carregar()
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando…</div>
  if (!ticket) return <div className="py-16 text-center text-sm text-red-400">Ticket não encontrado.</div>

  const acoesDisponiveis = acoes()
  const acaoAssumir = acoesDisponiveis.find(a => a.tipo === 'aceite')
  const acoesDoc = acoesDisponiveis.filter(a => a.tipo !== 'aceite')

  function motivoSemAcao(): string | null {
    if (acoesDisponiveis.length > 0 || !ticket) return null
    const s = ticket.status
    const fechados = ['corrigido', 'nao_corrigido', 'corrigido_parcialmente', 'cancelado', 'improcedente']
    if (fechados.includes(s)) return 'Este ticket está encerrado.'
    if (s === 'aberto' && !ehDoSubgrupo) return `Aguardando alguém do ${subgrupoLabel.toLowerCase()} de destino assumir.`
    if (s === 'em_tratamento') return `Em tratamento por ${ticket.assignee?.nome ?? 'um responsável'}.`
    if (s === 'aguardando_informacao') return `Aguardando resposta de ${ticket.aberto_por?.nome ?? 'quem abriu'}.`
    return 'Sem ações disponíveis no momento.'
  }
  const semAcaoMsg = motivoSemAcao()

  return (
    <div className="max-w-lg mx-auto p-4 pb-40">
      <button onClick={() => router.push('/operacao')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} /> Voltar para a operação
      </button>

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400">#{String(ticket.numero).padStart(4, '0')}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORIDADE_COR[ticket.prioridade]}`}>
              {ticket.prioridade}
            </span>
          </div>
          <span className="text-xs text-gray-400">{formatarTempo(ticket.criado_em)}</span>
        </div>
        <h1 className="text-base font-semibold text-gray-800 mt-2">{ticket.titulo}</h1>
        <p className="text-sm text-gray-600 mt-1">{ticket.descricao}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>Destino: <strong>{ticket.grupo?.nome ?? '—'} / {ticket.subgrupo?.nome ?? '—'}</strong></span>
          {ticket.categoria && <span>Categoria: <strong>{ticket.categoria.nome}</strong></span>}
          {ticket.aberto_por && <span>Aberto por: <strong>{ticket.aberto_por.nome}</strong></span>}
          {ticket.assignee && <span>Responsável: <strong>{ticket.assignee.nome}</strong></span>}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3 mb-4">
        {eventos.map(ev => {
          const conf = TIPO_EVENTO[ev.tipo] ?? { label: ev.tipo, cor: 'text-gray-500' }
          return (
            <div key={ev.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-semibold ${conf.cor}`}>{conf.label}</span>
                <span className="text-xs text-gray-400">{formatarTempo(ev.criado_em)}</span>
              </div>
              <p className="text-sm text-gray-700">{ev.texto}</p>
              <p className="text-xs text-gray-400 mt-1.5">{ev.autor?.nome}</p>
              {ev.evidencias?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {ev.evidencias.map(e => (
                    <a key={e.id} href={e.url} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-600 underline underline-offset-2">
                      {e.nome ?? e.tipo}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {semAcaoMsg && (
        <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4">
          <Info size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
          <span>{semAcaoMsg}</span>
        </div>
      )}

      {/* Painel de ação fixo */}
      {acoesDisponiveis.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40">
          <div className="max-w-lg mx-auto flex flex-col gap-3">

            {acaoSel ? (
              /* Ação documentada escolhida: observação (+ evidência) obrigatória */
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{acaoSel.label}</span>
                  <button onClick={() => { setAcaoSel(null); setTexto(''); setArquivos([]); setErro(null) }}
                    className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                </div>
                <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} autoFocus
                  placeholder="Observação obrigatória…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">
                    <Upload size={12} />
                    {arquivos.length > 0 ? `${arquivos.length} arq.` : 'Evidência'}
                    <input type="file" multiple accept="image/*,video/*" className="hidden"
                      onChange={e => setArquivos(Array.from(e.target.files ?? []))} />
                  </label>
                  <button onClick={() => executarAcao(acaoSel)} disabled={enviando}
                    className={`flex-1 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                      acaoSel.variante === 'danger' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-orange-500 text-white hover:bg-orange-600'
                    }`}>
                    {enviando && <Loader2 size={13} className="animate-spin" />}
                    Confirmar
                  </button>
                </div>
              </>
            ) : (
              /* Escolha da ação: Assumir é um toque; as demais abrem a observação */
              <div className="flex gap-2 flex-wrap">
                {acaoAssumir && (
                  <button onClick={() => executarAcao(acaoAssumir)} disabled={enviando}
                    className="flex-1 min-w-[8rem] bg-orange-500 text-white hover:bg-orange-600 text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {enviando && <Loader2 size={13} className="animate-spin" />}
                    Assumir ticket
                  </button>
                )}
                {acoesDoc.map(a => (
                  <button key={a.tipo + a.novoStatus} onClick={() => { setErro(null); setAcaoSel(a) }} disabled={enviando}
                    className={`flex-1 min-w-[8rem] text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 border ${
                      a.variante === 'danger' ? 'border-red-200 text-red-600 hover:bg-red-50'
                        : a.variante === 'primary' ? 'border-orange-300 text-orange-600 hover:bg-orange-50'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {erro && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle size={12} /> {erro}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
