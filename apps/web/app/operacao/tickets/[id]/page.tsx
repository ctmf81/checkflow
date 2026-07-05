'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Upload, AlertTriangle, Loader2, Info, ChevronDown,
  ArrowLeftRight, X, Play, FileText,
} from 'lucide-react'
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

interface GrupoOpcao { id: string; nome: string }
interface SubgrupoOpcao { id: string; nome: string; grupo_id: string }
interface UsuarioOpcao { id: string; nome: string }

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
  const [menuOpen, setMenuOpen] = useState(false)
  // Ampliação de evidência (foto)
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Transferência (destino grupo/subgrupo + opção de atribuir a alguém)
  const [transferOpen, setTransferOpen] = useState(false)
  const [grupos,    setGrupos]    = useState<GrupoOpcao[]>([])
  const [subgrupos, setSubgrupos] = useState<SubgrupoOpcao[]>([])
  const [grupoSel,    setGrupoSel]    = useState('')
  const [subgrupoSel, setSubgrupoSel] = useState('')
  const [usuariosSub, setUsuariosSub] = useState<UsuarioOpcao[]>([])
  const [usuarioSel,  setUsuarioSel]  = useState('')
  const [obsTransfer, setObsTransfer] = useState('')
  const [erroTransfer, setErroTransfer] = useState<string | null>(null)
  const [transferindo, setTransferindo] = useState(false)

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

  // Usuários do subgrupo de destino (para atribuir a alguém específico na transferência)
  useEffect(() => {
    if (!subgrupoSel) { setUsuariosSub([]); return }
    supabase.from('usuario_subgrupo')
      .select('usuarios(id, nome)').eq('subgrupo_id', subgrupoSel)
      .then(({ data }) => {
        setUsuariosSub((data ?? []).map((r: any) => r.usuarios).filter(Boolean).map((u: any) => ({ id: u.id, nome: u.nome })))
      })
  }, [subgrupoSel])

  const ehAssignee   = ticket?.assignee?.id === userId
  const ehAbridor    = ticket?.aberto_por?.id === userId
  const ehDoSubgrupo = !!ticket && meusSubgrupos.has(ticket.subgrupo_id)

  function acoes(): Acao[] {
    if (!ticket) return []
    return calcularAcoes({
      status: ticket.status, ehDoSubgrupo, ehAssignee, ehAbridor, podeCancelar,
      grupoLabel, subgrupoLabel,
    })
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
      ticket_id: id, tipo: acao.tipo, texto: textoEvento, autor_id: userId,
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

  function abrirTransferencia() {
    if (!ticket) return
    setErroTransfer(null); setObsTransfer(''); setUsuarioSel('')
    setGrupoSel(ticket.grupo_id); setSubgrupoSel(ticket.subgrupo_id)
    supabase.from('grupos').select('id, nome').eq('unidade_id', ticket.unidade_id).eq('status', 'ativo').order('nome')
      .then(async ({ data: gs }) => {
        setGrupos((gs as any) ?? [])
        const { data: sgs } = await supabase.from('subgrupos')
          .select('id, nome, grupo_id').in('grupo_id', (gs ?? []).map((g: any) => g.id)).eq('status', 'ativo').order('nome')
        setSubgrupos((sgs as any) ?? [])
      })
    setTransferOpen(true)
  }

  async function confirmarTransferencia() {
    if (!ticket) return
    if (!obsTransfer.trim()) { setErroTransfer('Observação é obrigatória.'); return }
    if (!grupoSel || !subgrupoSel) { setErroTransfer(`Selecione o ${grupoLabel.toLowerCase()} e o ${subgrupoLabel.toLowerCase()} de destino.`); return }
    const mesmoDestino = grupoSel === ticket.grupo_id && subgrupoSel === ticket.subgrupo_id
    if (mesmoDestino && !usuarioSel) {
      setErroTransfer(`Escolha um destino diferente ou atribua a alguém do ${subgrupoLabel.toLowerCase()}.`); return
    }
    setTransferindo(true); setErroTransfer(null)

    // Com usuário específico: atribui direto a ele (em tratamento) → ele é notificado.
    // Sem usuário: volta para "aberto" sem responsável, para o subgrupo assumir.
    const patch: Record<string, any> = usuarioSel
      ? { grupo_id: grupoSel, subgrupo_id: subgrupoSel, assignee_id: usuarioSel, status: 'em_tratamento' }
      : { grupo_id: grupoSel, subgrupo_id: subgrupoSel, assignee_id: null, status: 'aberto' }

    const { data: atualizado, error: upErr } = await supabase
      .from('tickets').update(patch).eq('id', id).select('id')

    if (upErr || !atualizado || atualizado.length === 0) {
      setTransferindo(false)
      setErroTransfer(upErr ? 'Não foi possível transferir o ticket.' : 'Você não tem permissão para transferir este ticket.')
      return
    }

    const grupoNovo    = grupos.find(g => g.id === grupoSel)?.nome ?? ''
    const subgrupoNovo = subgrupos.find(s => s.id === subgrupoSel)?.nome ?? ''
    const usuarioNovo  = usuariosSub.find(u => u.id === usuarioSel)?.nome ?? null
    const textoEvento  = usuarioNovo ? `${obsTransfer.trim()}\n→ Atribuído a ${usuarioNovo}` : obsTransfer.trim()

    const { error: evErr } = await supabase.from('ticket_eventos').insert({
      ticket_id: id, tipo: 'transferencia', texto: textoEvento, autor_id: userId,
      meta: {
        de: { grupo: ticket.grupo?.nome, subgrupo: ticket.subgrupo?.nome },
        para: { grupo: grupoNovo, subgrupo: subgrupoNovo, usuario: usuarioNovo },
      },
    })

    if (evErr) {
      setTransferindo(false)
      setErroTransfer('O ticket foi transferido, mas não foi possível registrar o evento.')
      carregar(); return
    }

    if (userId) notificarTicket({ ticket_id: id, evento: 'transferencia', ator_id: userId, texto: textoEvento })
    setTransferindo(false); setTransferOpen(false)
    carregar()
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando…</div>
  if (!ticket) return <div className="py-16 text-center text-sm text-red-400">Ticket não encontrado.</div>

  const acoesDisponiveis = acoes()
  const acaoAssumir = acoesDisponiveis.find(a => a.tipo === 'aceite')
  const acaoTransferir = acoesDisponiveis.find(a => a.tipo === 'transferencia')

  // Ordem fixa do menu na operação:
  // Solicitar informação → Comentar → Concluir corrigido → Marcar não corrigido → Cancelar.
  function ordemAcao(a: Acao): number {
    const key = a.tipo === 'conclusao' ? `conclusao:${a.novoStatus}` : a.tipo
    const mapa: Record<string, number> = {
      resposta_devolucao: 0, reabertura: 0,
      devolucao: 1, comentario: 2,
      'conclusao:corrigido': 3, 'conclusao:nao_corrigido': 4,
      cancelamento: 90,
    }
    return mapa[key] ?? 50
  }
  const acoesMenu = acoesDisponiveis
    .filter(a => a.tipo !== 'aceite' && a.tipo !== 'transferencia')
    .sort((x, y) => ordemAcao(x) - ordemAcao(y))

  function escolherAcao(a: Acao) {
    setMenuOpen(false)
    setErro(null)
    setAcaoSel(a)
  }

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
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ev.texto}</p>
              <p className="text-xs text-gray-400 mt-1.5">{ev.autor?.nome}</p>
              {ev.evidencias?.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {ev.evidencias.map(e => (
                    e.tipo === 'foto' ? (
                      <button key={e.id} onClick={() => setLightbox(e.url)}
                        className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-orange-300 transition-colors">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={e.url} alt={e.nome ?? 'evidência'} className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <a key={e.id} href={e.url} target="_blank" rel="noreferrer"
                        className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-orange-300 transition-colors">
                        {e.tipo === 'video' ? <Play size={18} /> : <FileText size={18} />}
                        <span className="text-[10px]">{e.tipo === 'video' ? 'Vídeo' : 'Arquivo'}</span>
                      </a>
                    )
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
              /* Escolha da ação: Assumir é um toque; as demais num menu; Transferir é ícone à parte */
              <div className="flex gap-2">
                {acaoAssumir && (
                  <button onClick={() => executarAcao(acaoAssumir)} disabled={enviando}
                    className="flex-1 bg-orange-500 text-white hover:bg-orange-600 text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {enviando && <Loader2 size={13} className="animate-spin" />}
                    Assumir ticket
                  </button>
                )}
                {acoesMenu.length > 0 && (
                  <div className="relative flex-1">
                    <button onClick={() => setMenuOpen(o => !o)}
                      className="w-full flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                      Ações <ChevronDown size={14} />
                    </button>
                    {menuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                        <div className="absolute bottom-full left-0 mb-1 w-60 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                          {acoesMenu.map(a => (
                            <button key={a.tipo + a.novoStatus} onClick={() => escolherAcao(a)}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${
                                a.variante === 'danger' ? 'text-red-600' : 'text-gray-700'
                              }`}>
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {acaoTransferir && (
                  <button onClick={abrirTransferencia} disabled={enviando} title="Transferir para outro grupo/subgrupo"
                    aria-label="Transferir ticket"
                    className="flex-shrink-0 w-11 flex items-center justify-center rounded-lg border border-gray-300 text-indigo-500 hover:bg-indigo-50 disabled:opacity-50">
                    <ArrowLeftRight size={16} />
                  </button>
                )}
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

      {/* Lightbox de evidência (foto) */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Evidência" className="max-w-full max-h-full rounded-lg" />
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Fechar">
            <X size={26} />
          </button>
        </div>
      )}

      {/* Modal de transferência */}
      {transferOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-gray-800">Transferir ticket</h2>
              <button onClick={() => setTransferOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Encaminhe para outro {grupoLabel.toLowerCase()}/{subgrupoLabel.toLowerCase()}. Se atribuir a alguém, o ticket já vai para essa pessoa e ela é notificada.
            </p>

            <label className="block text-xs font-medium text-gray-600 mb-1">{grupoLabel}</label>
            <select value={grupoSel}
              onChange={e => { setGrupoSel(e.target.value); setSubgrupoSel(''); setUsuarioSel('') }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="">Selecione…</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>

            <label className="block text-xs font-medium text-gray-600 mb-1">{subgrupoLabel}</label>
            <select value={subgrupoSel} onChange={e => { setSubgrupoSel(e.target.value); setUsuarioSel('') }}
              disabled={!grupoSel}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="">Selecione…</option>
              {subgrupos.filter(s => s.grupo_id === grupoSel).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>

            <label className="block text-xs font-medium text-gray-600 mb-1">Atribuir a <span className="text-gray-400">(opcional)</span></label>
            <select value={usuarioSel} onChange={e => setUsuarioSel(e.target.value)}
              disabled={!subgrupoSel || usuariosSub.length === 0}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-1 disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="">Qualquer um do {subgrupoLabel.toLowerCase()}</option>
              {usuariosSub.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <p className="text-[11px] text-gray-400 mb-3">
              {usuarioSel ? 'A notificação vai direto para a pessoa escolhida.' : `Fica em aberto para o ${subgrupoLabel.toLowerCase()} assumir.`}
            </p>

            <label className="block text-xs font-medium text-gray-600 mb-1">Observação</label>
            <textarea value={obsTransfer} onChange={e => setObsTransfer(e.target.value)} rows={2}
              placeholder="Motivo da transferência…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" />

            {erroTransfer && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={12} /> {erroTransfer}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setTransferOpen(false)} disabled={transferindo}
                className="text-sm font-medium px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={confirmarTransferencia} disabled={transferindo}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
                {transferindo && <Loader2 size={13} className="animate-spin" />}
                Transferir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
