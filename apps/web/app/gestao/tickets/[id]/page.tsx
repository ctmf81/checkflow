'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, CheckCircle2, XCircle, RotateCcw, MessageSquare,
  Upload, AlertTriangle, Loader2, UserCheck, AlertCircle, ChevronDown, Info
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { notificarTicket } from '@/lib/notificacoes'
import { registrarUsoArmazenamento } from '@/lib/uso'
import { acoesDisponiveis as calcularAcoes, type Acao } from '@/lib/tickets'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TicketStatus =
  | 'aberto' | 'em_tratamento' | 'aguardando_informacao'
  | 'aguardando_validacao' | 'corrigido' | 'nao_corrigido'
  | 'corrigido_parcialmente' | 'cancelado' | 'improcedente'

interface Ticket {
  id: string; numero: number; titulo: string; descricao: string
  prioridade: string; status: TicketStatus
  sla_deadline_at: string | null; sla_segundos_pausados: number; sla_pausado_em: string | null
  criado_em: string
  unidade_id: string; grupo_id: string; subgrupo_id: string
  grupo: { nome: string }; subgrupo: { nome: string }
  categoria: { nome: string } | null
  aberto_por: { id: string; nome: string }
  assignee: { id: string; nome: string } | null
}

interface GrupoOpcao { id: string; nome: string }
interface SubgrupoOpcao { id: string; nome: string; grupo_id: string }

interface Evento {
  id: string; tipo: string; texto: string; criado_em: string
  autor: { nome: string }
  evidencias: { id: string; url: string; tipo: string; nome: string | null }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_EVENTO: Record<string, { label: string; cor: string }> = {
  abertura:           { label: 'Ticket aberto',              cor: 'text-blue-600' },
  aceite:             { label: 'Assumido',                   cor: 'text-purple-600' },
  comentario:         { label: 'Comentário',                 cor: 'text-gray-600' },
  devolucao:          { label: 'Devolvido para informação',  cor: 'text-yellow-600' },
  resposta_devolucao: { label: 'Resposta enviada',           cor: 'text-blue-500' },
  transferencia:      { label: 'Transferido',                cor: 'text-indigo-600' },
  conclusao:          { label: 'Concluído pelo responsável', cor: 'text-green-600' },
  conclusao_proposta: { label: 'Conclusão proposta',         cor: 'text-orange-600' },
  validacao:          { label: 'Validado',                   cor: 'text-green-600' },
  reabertura:         { label: 'Reaberto',                   cor: 'text-red-500' },
  cancelamento:       { label: 'Cancelado',                  cor: 'text-gray-400' },
  improcedencia:      { label: 'Improcedente',               cor: 'text-gray-400' },
  escalada:           { label: 'Escalado',                   cor: 'text-red-600' },
}

const PRIORIDADE_COR: Record<string, string> = {
  critica: 'bg-red-500 text-white',
  alta:    'bg-orange-400 text-white',
  media:   'bg-yellow-400 text-gray-800',
  baixa:   'bg-green-400 text-white',
}

function formatarTempo(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TicketDetalhe() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { unidadeAtiva, empresaAtiva, grupoLabel, subgrupoLabel } = useSession()
  const supabase = createClient()
  const endRef = useRef<HTMLDivElement>(null)

  const [ticket,   setTicket]   = useState<Ticket | null>(null)
  const [eventos,  setEventos]  = useState<Evento[]>([])
  const [loading,  setLoading]  = useState(true)
  const [userId,   setUserId]   = useState<string | null>(null)
  const [podeCancelar, setPodeCancelar] = useState(false)
  const [isAdmin, setIsAdmin]   = useState(false)
  const [meusSubgrupos, setMeusSubgrupos] = useState<Set<string>>(new Set())

  // Formulário de ação
  const [texto,    setTexto]    = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [acaoOpen, setAcaoOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro,     setErro]     = useState<string | null>(null)

  // Transferência para outro grupo/subgrupo
  const [transferOpen, setTransferOpen] = useState(false)
  const [grupos,    setGrupos]    = useState<GrupoOpcao[]>([])
  const [subgrupos, setSubgrupos] = useState<SubgrupoOpcao[]>([])
  const [grupoSel,    setGrupoSel]    = useState('')
  const [subgrupoSel, setSubgrupoSel] = useState('')
  const [obsTransfer, setObsTransfer] = useState('')
  const [erroTransfer, setErroTransfer] = useState<string | null>(null)
  const [transferindo, setTransferindo] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUserId(u?.id ?? null)
      const admin = u?.user_metadata?.role === 'admin_sistema'
      setIsAdmin(admin)
      if (u && !admin) {
        const { data: us } = await supabase.from('usuario_subgrupo').select('subgrupo_id').eq('usuario_id', u.id)
        setMeusSubgrupos(new Set((us ?? []).map((r: any) => r.subgrupo_id)))
      }
    })
    supabase.rpc('usuario_tem_permissao', { p_recurso: 'ticket', p_acao: 'cancelar' })
      .then(({ data }) => setPodeCancelar(!!data))
  }, [])

  async function carregar() {
    const [{ data: t }, { data: ev }] = await Promise.all([
      supabase.from('tickets').select(`
        id, numero, titulo, descricao, prioridade, status, criado_em,
        sla_deadline_at, sla_segundos_pausados, sla_pausado_em,
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
  const semAssignee  = !ticket?.assignee
  // Só quem é do subgrupo de destino (ou admin) pode assumir/tratar o ticket
  const ehDoSubgrupo = isAdmin || (!!ticket && meusSubgrupos.has(ticket.subgrupo_id))

  // ─── Ações disponíveis por status + papel ─────────────────────────────────
  // Regra de negócio pura em lib/tickets.ts (coberta por testes unitários).

  function acoesDisponiveis(): Acao[] {
    if (!ticket) return []
    return calcularAcoes({
      status: ticket.status, ehDoSubgrupo, ehAssignee, ehAbridor, podeCancelar,
      grupoLabel, subgrupoLabel,
    })
  }

  async function executarAcao(acao: Acao) {
    if (!texto.trim()) { setErro('Observação é obrigatória para registrar a ação.'); return }
    setEnviando(true); setErro(null)

    // Atualiza o status ANTES de registrar o evento — RLS bloqueia updates
    // silenciosamente (retorna 0 linhas, sem erro), então confere com .select()
    // para não gravar na timeline uma transição que não aconteceu.
    if (acao.tipo === 'aceite' || acao.novoStatus !== ticket!.status) {
      const patch: Record<string, any> =
        acao.tipo === 'aceite'     ? { assignee_id: userId, status: acao.novoStatus } :
        acao.tipo === 'reabertura' ? { assignee_id: null,   status: acao.novoStatus } :
                                     { status: acao.novoStatus }

      const { data: atualizado, error: upErr } = await supabase
        .from('tickets').update(patch).eq('id', id).select('id')

      if (upErr || !atualizado || atualizado.length === 0) {
        setEnviando(false)
        setErro(upErr
          ? `Erro ao atualizar o ticket: ${upErr.message}`
          : 'Você não tem permissão para executar esta ação neste ticket.')
        return
      }
    }

    // Cria evento
    const { data: evento, error: evErr } = await supabase.from('ticket_eventos').insert({
      ticket_id: id, tipo: acao.tipo, texto: texto.trim(),
    }).select('id').single()

    if (evErr) {
      setEnviando(false)
      setErro(`Status atualizado, mas falhou ao registrar o evento: ${evErr.message}`)
      carregar()
      return
    }

    // Upload evidências
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

    // notifica as partes envolvidas (fire-and-forget)
    if (userId) {
      notificarTicket({ ticket_id: id, evento: acao.tipo, ator_id: userId, texto: texto.trim() })
    }

    setTexto(''); setArquivos([]); setAcaoOpen(false); setEnviando(false)
    carregar()
  }

  async function abrirTransferencia() {
    if (!ticket) return
    setErroTransfer(null)
    setObsTransfer('')
    setGrupoSel(ticket.grupo_id)
    setSubgrupoSel(ticket.subgrupo_id)
    const { data: gs } = await supabase.from('grupos')
      .select('id, nome').eq('unidade_id', ticket.unidade_id).order('nome')
    setGrupos((gs as any) ?? [])
    const { data: sgs } = await supabase.from('subgrupos')
      .select('id, nome, grupo_id').in('grupo_id', (gs ?? []).map((g: any) => g.id)).order('nome')
    setSubgrupos((sgs as any) ?? [])
    setTransferOpen(true)
  }

  async function confirmarTransferencia() {
    if (!ticket) return
    if (!obsTransfer.trim()) { setErroTransfer('Observação é obrigatória.'); return }
    if (!grupoSel || !subgrupoSel) { setErroTransfer(`Selecione o ${grupoLabel.toLowerCase()} e o ${subgrupoLabel.toLowerCase()} de destino.`); return }
    if (grupoSel === ticket.grupo_id && subgrupoSel === ticket.subgrupo_id) {
      setErroTransfer(`Selecione um ${grupoLabel.toLowerCase()}/${subgrupoLabel.toLowerCase()} diferente do atual.`); return
    }

    setTransferindo(true); setErroTransfer(null)

    const { data: atualizado, error: upErr } = await supabase
      .from('tickets')
      .update({ grupo_id: grupoSel, subgrupo_id: subgrupoSel, assignee_id: null, status: 'aberto' })
      .eq('id', id).select('id')

    if (upErr || !atualizado || atualizado.length === 0) {
      setTransferindo(false)
      setErroTransfer(upErr ? `Erro ao transferir: ${upErr.message}` : 'Você não tem permissão para transferir este ticket.')
      return
    }

    const grupoAnterior = grupos.find(g => g.id === ticket.grupo_id)?.nome ?? ticket.grupo.nome
    const subgrupoAnterior = subgrupos.find(s => s.id === ticket.subgrupo_id)?.nome ?? ticket.subgrupo.nome
    const grupoNovo = grupos.find(g => g.id === grupoSel)?.nome ?? ''
    const subgrupoNovo = subgrupos.find(s => s.id === subgrupoSel)?.nome ?? ''

    const { error: evErr } = await supabase.from('ticket_eventos').insert({
      ticket_id: id, tipo: 'transferencia', texto: obsTransfer.trim(),
      meta: {
        de: { grupo: grupoAnterior, subgrupo: subgrupoAnterior },
        para: { grupo: grupoNovo, subgrupo: subgrupoNovo },
      },
    })

    if (evErr) {
      setTransferindo(false)
      setErroTransfer(`Transferido, mas falhou ao registrar o evento: ${evErr.message}`)
      carregar()
      return
    }

    if (userId) {
      notificarTicket({ ticket_id: id, evento: 'transferencia', ator_id: userId, texto: obsTransfer.trim() })
    }

    setTransferindo(false); setTransferOpen(false)
    carregar()
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando…</div>
  if (!ticket) return <div className="py-16 text-center text-sm text-red-400">Ticket não encontrado.</div>

  const acoes = acoesDisponiveis()

  // Quando não há ações para este usuário, explica o porquê (intuitividade)
  function motivoSemAcao(): string | null {
    if (acoes.length > 0 || !ticket) return null
    const s = ticket.status
    const fechados = ['corrigido', 'nao_corrigido', 'corrigido_parcialmente', 'cancelado', 'improcedente']
    if (fechados.includes(s)) {
      return ehAbridor
        ? 'Este ticket está encerrado.'
        : 'Este ticket está encerrado. Apenas quem o abriu pode reabri-lo.'
    }
    if (s === 'aberto' && !ehDoSubgrupo) {
      return `Aguardando alguém do ${subgrupoLabel.toLowerCase()} de destino (${ticket.subgrupo.nome}) assumir. Só quem é desse ${subgrupoLabel.toLowerCase()} pode assumir.`
    }
    if (s === 'em_tratamento') {
      return `Em tratamento por ${ticket.assignee?.nome ?? 'um responsável'}. Apenas o responsável pode movimentá-lo agora.`
    }
    if (s === 'aguardando_informacao') {
      return `Aguardando resposta de ${ticket.aberto_por.nome} (quem abriu o ticket).`
    }
    if (s === 'aguardando_validacao') {
      return `Aguardando validação de ${ticket.aberto_por.nome} (quem abriu o ticket).`
    }
    return 'Você não tem ações disponíveis neste ticket no momento.'
  }
  const semAcaoMsg = motivoSemAcao()

  return (
    <div className="max-w-2xl mx-auto p-4 pb-32">
      {/* Voltar */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} /> Voltar
      </button>

      {/* Cabeçalho do ticket */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400">#{String(ticket.numero).padStart(4,'0')}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORIDADE_COR[ticket.prioridade]}`}>
              {ticket.prioridade}
            </span>
          </div>
          <span className="text-xs text-gray-400">{formatarTempo(ticket.criado_em)}</span>
        </div>
        <h1 className="text-base font-semibold text-gray-800 mt-2">{ticket.titulo}</h1>
        <p className="text-sm text-gray-600 mt-1">{ticket.descricao}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>Destino: <strong>{ticket.grupo.nome} / {ticket.subgrupo.nome}</strong></span>
          {ticket.categoria && <span>Categoria: <strong>{ticket.categoria.nome}</strong></span>}
          <span>Aberto por: <strong>{ticket.aberto_por.nome}</strong></span>
          {ticket.assignee && <span>Responsável: <strong>{ticket.assignee.nome}</strong></span>}
        </div>
        {semAssignee && ticket.status === 'aberto' && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
            <UserCheck size={13} /> Aguardando alguém assumir este ticket
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="space-y-3 mb-4">
        {eventos.map((ev, i) => {
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
                      className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800">
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

      {/* Sem ações disponíveis — explica o estado em vez de não mostrar nada */}
      {semAcaoMsg && (
        <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4">
          <Info size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
          <span>{semAcaoMsg}</span>
        </div>
      )}

      {/* Painel de ação fixo no rodapé */}
      {acoes.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40">
          <div className="max-w-2xl mx-auto flex flex-col gap-3">
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
              placeholder="Observação obrigatória para registrar qualquer ação…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">
                <Upload size={12} />
                {arquivos.length > 0 ? `${arquivos.length} arq.` : 'Evidência'}
                <input type="file" multiple accept="image/*,video/*" className="hidden"
                  onChange={e => setArquivos(Array.from(e.target.files ?? []))} />
              </label>

              <div className="flex-1 flex gap-2 justify-end flex-wrap">
                {acoes.filter(a => a.variante !== 'ghost').map(a => (
                  <button key={a.tipo + a.novoStatus}
                    onClick={() => executarAcao(a)}
                    disabled={enviando}
                    className={`text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-1.5 ${
                      a.variante === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-red-50 text-red-600 hover:bg-red-100'
                    }`}>
                    {enviando && <Loader2 size={13} className="animate-spin" />}
                    {a.label}
                  </button>
                ))}
                {acoes.filter(a => a.variante === 'ghost').length > 0 && (
                  <div className="relative">
                    <button onClick={() => setAcaoOpen(o => !o)}
                      className="flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                      Mais <ChevronDown size={13} />
                    </button>
                    {acaoOpen && (
                      <div className="absolute bottom-full right-0 mb-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-48 z-50">
                        {acoes.filter(a => a.variante === 'ghost').map(a => (
                          <button key={a.tipo + a.novoStatus}
                            onClick={() => { setAcaoOpen(false); a.tipo === 'transferencia' ? abrirTransferencia() : executarAcao(a) }}
                            disabled={enviando}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {erro && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle size={12} /> {erro}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de transferência */}
      {transferOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Transferir ticket</h2>
            <p className="text-xs text-gray-500 mb-4">
              O ticket volta para "Aberto" sem responsável, para que alguém do novo {grupoLabel.toLowerCase()}/{subgrupoLabel.toLowerCase()} possa assumi-lo.
            </p>

            <label className="block text-xs font-medium text-gray-600 mb-1">{grupoLabel}</label>
            <select value={grupoSel}
              onChange={e => { setGrupoSel(e.target.value); setSubgrupoSel('') }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Selecione…</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>

            <label className="block text-xs font-medium text-gray-600 mb-1">{subgrupoLabel}</label>
            <select value={subgrupoSel} onChange={e => setSubgrupoSel(e.target.value)}
              disabled={!grupoSel}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Selecione…</option>
              {subgrupos.filter(s => s.grupo_id === grupoSel).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>

            <label className="block text-xs font-medium text-gray-600 mb-1">Observação</label>
            <textarea value={obsTransfer} onChange={e => setObsTransfer(e.target.value)} rows={2}
              placeholder="Motivo da transferência…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />

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
                className="text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
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
