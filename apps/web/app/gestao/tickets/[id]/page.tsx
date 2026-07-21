'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, CheckCircle2, XCircle, RotateCcw, MessageSquare,
  AlertTriangle, Loader2, UserCheck, AlertCircle, ChevronDown, Info,
  Link2, Unlink, Copy
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { notificarTicket, vincularTicketDuplicado, desvincularTicketDuplicado } from '@/lib/notificacoes'
import { registrarUsoArmazenamento, armazenamentoDisponivel, somaBytes, MSG_ARMAZENAMENTO_CHEIO } from '@/lib/uso'
import { acoesDisponiveis as calcularAcoes, podeVincular, STATUS_ABERTOS, type Acao, type TicketStatus as TStatus } from '@/lib/tickets'
import { ehAdminDaEmpresa } from '@/lib/admin'
import { EvidenciaPicker } from '@/components/tickets/EvidenciaPicker'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TicketStatus =
  | 'aberto' | 'em_tratamento' | 'aguardando_informacao'
  | 'aguardando_validacao' | 'corrigido' | 'nao_corrigido'
  | 'corrigido_parcialmente' | 'cancelado' | 'improcedente' | 'duplicado'

interface Ticket {
  id: string; numero: number; titulo: string; descricao: string
  prioridade: string; status: TicketStatus
  sla_deadline_at: string | null; sla_segundos_pausados: number; sla_pausado_em: string | null
  criado_em: string
  unidade_id: string; grupo_id: string; subgrupo_id: string
  ticket_pai_id: string | null
  grupo: { nome: string }; subgrupo: { nome: string }
  categoria: { nome: string } | null
  aberto_por: { id: string; nome: string }
  assignee: { id: string; nome: string } | null
}

/** Ticket resumido para os blocos de vínculo (principal / duplicados / picker). */
interface TicketResumo { id: string; numero: number; titulo: string; status: string }

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
  vinculo:            { label: 'Duplicado vinculado',        cor: 'text-indigo-600' },
  desvinculo:         { label: 'Vínculo desfeito',           cor: 'text-gray-500' },
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

  // Vínculo de duplicados
  const [principal, setPrincipal]   = useState<TicketResumo | null>(null)
  const [duplicados, setDuplicados] = useState<TicketResumo[]>([])
  const [vincOpen, setVincOpen]     = useState(false)
  const [vincModo, setVincModo]     = useState<'anexar' | 'este_e_dup'>('anexar')
  const [candidatos, setCandidatos] = useState<TicketResumo[]>([])
  const [buscaVinc, setBuscaVinc]   = useState('')
  const [alvoSel, setAlvoSel]       = useState('')
  const [vinculando, setVinculando] = useState(false)
  const [erroVinc, setErroVinc]     = useState<string | null>(null)

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
      const admin = await ehAdminDaEmpresa(supabase, empresaAtiva?.id)
      setIsAdmin(admin)
      if (u && !admin) {
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
        sla_deadline_at, sla_segundos_pausados, sla_pausado_em,
        unidade_id, grupo_id, subgrupo_id, ticket_pai_id,
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

    // Vínculos: se for duplicado, carrega o principal; se for principal, os duplicados.
    const tt = t as any
    if (tt?.ticket_pai_id) {
      const { data: pai } = await supabase.from('tickets')
        .select('id, numero, titulo, status').eq('id', tt.ticket_pai_id).single()
      setPrincipal((pai as any) ?? null)
    } else {
      setPrincipal(null)
    }
    const { data: filhos } = await supabase.from('tickets')
      .select('id, numero, titulo, status').eq('ticket_pai_id', id).order('numero', { ascending: true })
    setDuplicados((filhos as any) ?? [])

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

    // Freio de cota de armazenamento: bloqueia antes de mexer no ticket se as
    // evidências da ação não couberem no plano.
    if (!(await armazenamentoDisponivel(supabase, empresaAtiva?.id, somaBytes(arquivos)))) {
      setEnviando(false); setErro(MSG_ARMAZENAMENTO_CHEIO); return
    }

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
          ? 'Não foi possível atualizar o ticket. Tente novamente.'
          : 'Você não tem permissão para executar esta ação neste ticket.')
        return
      }
    }

    // Cria evento
    const { data: evento, error: evErr } = await supabase.from('ticket_eventos').insert({
      ticket_id: id, tipo: acao.tipo, texto: texto.trim(), autor_id: userId,
    }).select('id').single()

    if (evErr) {
      setEnviando(false)
      setErro('O status foi atualizado, mas não foi possível registrar o evento.')
      carregar()
      return
    }

    // Upload evidências
    if (evento) {
      for (const file of arquivos) {
        const ext  = file.name.split('.').pop()
        const path = `tickets/${id}/${Date.now()}.${ext}`
        const { data: up, error: upErr } = await supabase.storage.from('execucoes').upload(path, file, { upsert: false })
        if (upErr) console.error('[CheckFlow] Falha ao subir evidência do ticket:', upErr.message)
        if (up) {
          registrarUsoArmazenamento(empresaAtiva?.id, 'ticket', file.size)
          const { data: pub } = supabase.storage.from('execucoes').getPublicUrl(path)
          const tipo = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'foto' : 'documento'
          await supabase.from('ticket_evidencias').insert({
            ticket_id: id, evento_id: evento.id, url: pub.publicUrl, tipo, nome: file.name, uploaded_by: userId,
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
      setErroTransfer(upErr ? 'Não foi possível transferir o ticket.' : 'Você não tem permissão para transferir este ticket.')
      return
    }

    const grupoAnterior = grupos.find(g => g.id === ticket.grupo_id)?.nome ?? ticket.grupo.nome
    const subgrupoAnterior = subgrupos.find(s => s.id === ticket.subgrupo_id)?.nome ?? ticket.subgrupo.nome
    const grupoNovo = grupos.find(g => g.id === grupoSel)?.nome ?? ''
    const subgrupoNovo = subgrupos.find(s => s.id === subgrupoSel)?.nome ?? ''

    const { error: evErr } = await supabase.from('ticket_eventos').insert({
      ticket_id: id, tipo: 'transferencia', texto: obsTransfer.trim(), autor_id: userId,
      meta: {
        de: { grupo: grupoAnterior, subgrupo: subgrupoAnterior },
        para: { grupo: grupoNovo, subgrupo: subgrupoNovo },
      },
    })

    if (evErr) {
      setTransferindo(false)
      setErroTransfer('O ticket foi transferido, mas não foi possível registrar o evento.')
      carregar()
      return
    }

    if (userId) {
      notificarTicket({ ticket_id: id, evento: 'transferencia', ator_id: userId, texto: obsTransfer.trim() })
    }

    setTransferindo(false); setTransferOpen(false)
    carregar()
  }

  const podeGerirVinc = !!ticket && podeVincular({ status: (ticket.status as any), ehAssignee, isAdmin })

  async function abrirVincular() {
    if (!ticket) return
    setErroVinc(null); setAlvoSel(''); setBuscaVinc(''); setVincModo('anexar')
    const { data } = await supabase.from('tickets')
      .select('id, numero, titulo, status').eq('unidade_id', ticket.unidade_id)
      .order('numero', { ascending: false })
    // Só tickets ativos e diferentes deste (duplicados/encerrados não entram).
    setCandidatos((data as any[] ?? []).filter(c => c.id !== ticket.id && STATUS_ABERTOS.includes(c.status)))
    setVincOpen(true)
  }

  async function confirmarVincular() {
    if (!ticket || !userId) return
    if (!alvoSel) { setErroVinc('Selecione um ticket.'); return }
    setVinculando(true); setErroVinc(null)
    const principal_id = vincModo === 'anexar' ? ticket.id : alvoSel
    const duplicado_id = vincModo === 'anexar' ? alvoSel : ticket.id
    const r = await vincularTicketDuplicado({ principal_id, duplicado_id, ator_id: userId })
    setVinculando(false)
    if (!r.ok) { setErroVinc(r.error ?? 'Falha ao vincular.'); return }
    setVincOpen(false)
    // Se ESTE virou duplicado, vai para o principal (onde o trabalho acontece).
    if (vincModo === 'este_e_dup' && r.principal_id) router.push(`/gestao/tickets/${r.principal_id}`)
    else carregar()
  }

  async function desvincular(dupId: string) {
    if (!userId) return
    const r = await desvincularTicketDuplicado({ duplicado_id: dupId, ator_id: userId })
    if (r.ok) carregar()
    else setErro(r.error ?? 'Falha ao desvincular.')
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando…</div>
  if (!ticket) return <div className="py-16 text-center text-sm text-red-400">Ticket não encontrado.</div>

  const acoes = acoesDisponiveis()

  // Quando não há ações para este usuário, explica o porquê (intuitividade)
  function motivoSemAcao(): string | null {
    if (acoes.length > 0 || !ticket) return null
    const s = ticket.status
    if (s === 'duplicado') return null // o banner do vínculo já explica o estado
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
        <p className="hidden sm:block text-sm text-gray-600 mt-1">{ticket.descricao}</p>
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

      {/* Este ticket É um duplicado → aponta para o principal */}
      {principal && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-2">
            <Copy size={15} className="text-indigo-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-indigo-900 font-medium">Este chamado foi vinculado como duplicado.</p>
              <p className="text-xs text-indigo-700 mt-0.5">
                O tratamento acontece no chamado principal. Você será avisado quando ele for concluído.
              </p>
              <button onClick={() => router.push(`/gestao/tickets/${principal.id}`)}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900">
                <Link2 size={13} /> Ver o principal #{String(principal.numero).padStart(4, '0')} — {principal.titulo}
              </button>
              {(podeGerirVinc || isAdmin) && (
                <button onClick={() => desvincular(ticket.id)}
                  className="mt-2 ml-4 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                  <Unlink size={12} /> Desvincular
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Este ticket É principal → lista duplicados/interessados + ação de vincular */}
      {!principal && (duplicados.length > 0 || podeGerirVinc) && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Copy size={14} className="text-indigo-500" /> Duplicados vinculados
              {duplicados.length > 0 && <span className="text-xs font-normal text-gray-400">({duplicados.length})</span>}
            </h2>
            {podeGerirVinc && (
              <button onClick={abrirVincular}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                <Link2 size={13} /> Vincular duplicado
              </button>
            )}
          </div>
          {duplicados.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum. Vincule chamados abertos para a mesma finalidade — quem os abriu acompanha por aqui.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {duplicados.map(d => (
                <li key={d.id} className="flex items-center justify-between py-2 gap-2">
                  <button onClick={() => router.push(`/gestao/tickets/${d.id}`)}
                    className="text-left text-sm text-gray-700 hover:text-indigo-700 truncate">
                    <span className="font-mono text-xs text-gray-400 mr-1.5">#{String(d.numero).padStart(4, '0')}</span>
                    {d.titulo}
                  </button>
                  {podeGerirVinc && (
                    <button onClick={() => desvincular(d.id)}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
                      <Unlink size={12} /> Desvincular
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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

            <div className="flex items-center gap-2 flex-wrap">
              <EvidenciaPicker files={arquivos} onFilesChange={setArquivos} onError={setErro} />

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

      {/* Modal de vínculo de duplicado */}
      {vincOpen && ticket && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Vincular chamado duplicado</h2>
            <p className="text-xs text-gray-500 mb-4">
              O duplicado congela e some das filas; quem o abriu passa a acompanhar por este chamado e é avisado na conclusão.
            </p>

            {/* Sentido do vínculo */}
            <div className="flex flex-col gap-2 mb-3">
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="vincModo" className="mt-0.5" checked={vincModo === 'anexar'}
                  onChange={() => setVincModo('anexar')} />
                <span>Marcar <strong>outro chamado</strong> como duplicado <strong>deste</strong> (este vira o principal)</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="vincModo" className="mt-0.5" checked={vincModo === 'este_e_dup'}
                  onChange={() => setVincModo('este_e_dup')} />
                <span>Marcar <strong>este chamado</strong> como duplicado de <strong>outro</strong> (o outro vira o principal)</span>
              </label>
            </div>

            <label className="block text-xs font-medium text-gray-600 mb-1">
              {vincModo === 'anexar' ? 'Chamado que é duplicado deste' : 'Chamado principal'}
            </label>
            <input value={buscaVinc} onChange={e => setBuscaVinc(e.target.value)}
              placeholder="Buscar por número ou título…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />

            <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50 mb-3">
              {candidatos
                .filter(c => {
                  const q = buscaVinc.trim().toLowerCase()
                  if (!q) return true
                  return c.titulo.toLowerCase().includes(q) || String(c.numero).padStart(4, '0').includes(q.replace('#', ''))
                })
                .slice(0, 50)
                .map(c => (
                  <button key={c.id} onClick={() => setAlvoSel(c.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${alvoSel === c.id ? 'bg-indigo-50' : ''}`}>
                    <span className="font-mono text-xs text-gray-400">#{String(c.numero).padStart(4, '0')}</span>
                    <span className="text-gray-700 truncate">{c.titulo}</span>
                    {alvoSel === c.id && <CheckCircle2 size={14} className="text-indigo-600 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              {candidatos.length === 0 && (
                <p className="px-3 py-4 text-xs text-gray-400 text-center">Nenhum chamado ativo disponível para vincular nesta unidade.</p>
              )}
            </div>

            {erroVinc && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={12} /> {erroVinc}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setVincOpen(false)} disabled={vinculando}
                className="text-sm font-medium px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={confirmarVincular} disabled={vinculando || !alvoSel}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                {vinculando && <Loader2 size={13} className="animate-spin" />}
                Vincular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
