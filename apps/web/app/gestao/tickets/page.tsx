'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, Ticket, Clock, AlertCircle, CheckCircle2, XCircle, RotateCcw, Filter } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import NovoTicketModal from '@/components/tickets/NovoTicketModal'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { ticketVisivel, slaStatus, STATUS_ABERTOS, STATUS_NAO_ACEITO, STATUS_EM_TRATAMENTO } from '@/lib/tickets'
import { ehAdminDaEmpresa } from '@/lib/admin'
import { useToast } from '@/components/ui/feedback'

interface TicketRow {
  id: string
  numero: number
  titulo: string
  prioridade: 'critica' | 'alta' | 'media' | 'baixa'
  status: string
  criado_em: string
  subgrupo_id: string
  aberto_por_id: string
  sla_deadline_at: string | null
  sla_segundos_pausados: number
  sla_pausado_em: string | null
  grupo: { nome: string }
  subgrupo: { nome: string }
  categoria: { nome: string } | null
  aberto_por: { nome: string }
  assignee: { nome: string } | null
}

const STATUS_CONFIG: Record<string, { label: string; cor: string; icon: any }> = {
  aberto:                 { label: 'Aberto',               cor: 'bg-blue-100 text-blue-700',   icon: Ticket },
  em_tratamento:          { label: 'Em tratamento',        cor: 'bg-purple-100 text-purple-700', icon: RotateCcw },
  aguardando_informacao:  { label: 'Aguard. informação',   cor: 'bg-yellow-100 text-yellow-700', icon: Clock },
  corrigido:              { label: 'Corrigido',            cor: 'bg-green-100 text-green-700',   icon: CheckCircle2 },
  nao_corrigido:          { label: 'Não corrigido',        cor: 'bg-red-100 text-red-700',       icon: XCircle },
  corrigido_parcialmente: { label: 'Corrigido parcial',    cor: 'bg-teal-100 text-teal-700',     icon: CheckCircle2 },
  cancelado:              { label: 'Cancelado',            cor: 'bg-gray-100 text-gray-500',     icon: XCircle },
  improcedente:           { label: 'Improcedente',         cor: 'bg-gray-100 text-gray-500',     icon: XCircle },
}

const PRIORIDADE_CONFIG: Record<string, { label: string; cor: string }> = {
  critica: { label: 'Crítica', cor: 'bg-red-500 text-white' },
  alta:    { label: 'Alta',    cor: 'bg-orange-400 text-white' },
  media:   { label: 'Média',   cor: 'bg-yellow-400 text-gray-800' },
  baixa:   { label: 'Baixa',   cor: 'bg-green-400 text-white' },
}

const SLA_DOT: Record<string, string> = {
  verde:    'bg-green-400',
  amarelo:  'bg-yellow-400',
  vermelho: 'bg-red-500 animate-pulse',
}

const ABERTOS = STATUS_ABERTOS as readonly string[]

export default function TicketsPage() {
  const { unidadeAtiva, empresaAtiva } = useSession()
  const supabase = createClient()
  const toast = useToast()

  const [tickets, setTickets]     = useState<TicketRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [busca,   setBusca]       = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'aberto' | 'tratamento' | 'finalizados' | 'todos'>('aberto')
  const [novoOpen, setNovoOpen]   = useState(false)
  const [userId, setUserId]       = useState<string | null>(null)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [meusSubgrupos, setMeusSubgrupos] = useState<Set<string>>(new Set())

  async function carregar() {
    if (!unidadeAtiva) { setLoading(false); return }
    setLoading(true)
    // Visibilidade: usuário vê os tickets dos seus subgrupos (+ os que abriu); admin vê todos
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)
    const admin = await ehAdminDaEmpresa(supabase, empresaAtiva?.id)
    setIsAdmin(admin)
    if (user && !admin) {
      const { data: us } = await supabase.from('usuario_subgrupo').select('subgrupo_id').eq('usuario_id', user.id)
      setMeusSubgrupos(new Set((us ?? []).map((r: any) => r.subgrupo_id)))
    }
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        id, numero, titulo, prioridade, status, criado_em, subgrupo_id, aberto_por_id,
        sla_deadline_at, sla_segundos_pausados, sla_pausado_em,
        grupo:grupos(nome), subgrupo:subgrupos(nome),
        categoria:ticket_categorias(nome),
        aberto_por:usuarios!tickets_aberto_por_id_fkey(nome),
        assignee:usuarios!tickets_assignee_id_fkey(nome)
      `)
      .eq('unidade_id', unidadeAtiva.id)
      .order('criado_em', { ascending: false })
    if (error) toast.error('Não foi possível carregar os tickets.')
    setTickets((data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva])

  // Pré-filtra ao chegar dos Indicadores (?status=aberto|tratamento|finalizados|todos)
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status')
    if (s === 'aberto' || s === 'tratamento' || s === 'finalizados' || s === 'todos') setFiltroStatus(s)
  }, [])

  const visCtx = { userId, isAdmin, meusSubgrupos }
  const filtrados = tickets.filter(t => {
    if (!ticketVisivel(t, visCtx)) return false
    const matchStatus =
      filtroStatus === 'todos'      ? true :
      filtroStatus === 'aberto'     ? STATUS_NAO_ACEITO.includes(t.status as any) :
      filtroStatus === 'tratamento' ? STATUS_EM_TRATAMENTO.includes(t.status as any) :
      !ABERTOS.includes(t.status)   // finalizados
    const matchBusca = !busca || t.titulo.toLowerCase().includes(busca.toLowerCase())
      || String(t.numero).includes(busca)
    return matchStatus && matchBusca
  })

  // Abri e devolveram para eu responder → precisa da minha ação (fica evidente no topo).
  const aguardandoMinhaResposta = tickets.filter(t => t.aberto_por_id === userId && t.status === 'aguardando_informacao')

  const visiveis = tickets.filter(t => ticketVisivel(t, visCtx))
  const contadores = {
    naoAceitos:   visiveis.filter(t => STATUS_NAO_ACEITO.includes(t.status as any)).length,
    emTratamento: visiveis.filter(t => STATUS_EM_TRATAMENTO.includes(t.status as any)).length,
    fechados:     visiveis.filter(t => !ABERTOS.includes(t.status)).length,
    criticos:     visiveis.filter(t => t.prioridade === 'critica' && ABERTOS.includes(t.status)).length,
  }

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  const cfg = getOnboardingConfig('tickets')!

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Tickets</h1>
          <p className="hidden sm:block text-sm text-gray-500 mt-0.5">Chamados e ocorrências</p>
        </div>
        <button onClick={() => setNovoOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Novo Ticket
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-lg sm:text-2xl font-bold text-blue-700">{contadores.naoAceitos}</div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">Em aberto (a aceitar)</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-lg sm:text-2xl font-bold text-purple-700">{contadores.emTratamento}</div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">Em tratamento</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-lg sm:text-2xl font-bold text-red-600">{contadores.criticos}</div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">Críticos em andamento</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-lg sm:text-2xl font-bold text-gray-800">{contadores.fechados}</div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">Finalizados</div>
        </div>
      </div>

      {/* Aguardando sua resposta — tickets que você abriu e voltaram para você */}
      {aguardandoMinhaResposta.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={15} className="text-yellow-500" />
            <h2 className="text-sm font-semibold text-gray-700">Aguardando sua resposta</h2>
            <span className="text-xs bg-yellow-100 text-yellow-700 font-semibold px-2 py-0.5 rounded-full">{aguardandoMinhaResposta.length}</span>
          </div>
          <div className="bg-white rounded-xl border border-yellow-200 divide-y divide-gray-50">
            {aguardandoMinhaResposta.map(t => (
              <Link key={t.id} href={`/gestao/tickets/${t.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-yellow-50 transition-colors">
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORIDADE_CONFIG[t.prioridade].cor}`}>
                  {PRIORIDADE_CONFIG[t.prioridade].label}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-400 font-mono mr-2">#{String(t.numero).padStart(4,'0')}</span>
                  <span className="text-sm font-medium text-gray-800">{t.titulo}</span>
                </div>
                <span className="text-xs font-medium text-yellow-700 shrink-0">Responder →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título ou #número…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {([
            { v: 'aberto',      label: 'Em aberto' },
            { v: 'tratamento',  label: 'Em tratamento' },
            { v: 'finalizados', label: 'Finalizados' },
            { v: 'todos',       label: 'Todos' },
          ] as const).map(f => (
            <button key={f.v} onClick={() => setFiltroStatus(f.v)}
              className={`px-3 py-2 font-medium transition-colors ${filtroStatus === f.v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando…</div>
      ) : filtrados.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">Nenhum ticket encontrado.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {filtrados.map(t => {
            const sla    = slaStatus(t)
            const stConf = STATUS_CONFIG[t.status] ?? STATUS_CONFIG['aberto']
            const prConf = PRIORIDADE_CONFIG[t.prioridade]
            const Icon   = stConf.icon
            return (
              <Link key={t.id} href={`/gestao/tickets/${t.id}`}
                className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                {/* Prioridade pill */}
                <span className={`mt-0.5 shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${prConf.cor}`}>
                  {prConf.label}
                </span>
                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 font-mono">#{String(t.numero).padStart(4,'0')}</span>
                    <span className="text-sm font-medium text-gray-800 truncate">{t.titulo}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    <span>{t.grupo?.nome} / {t.subgrupo?.nome}</span>
                    {t.categoria && <><span>·</span><span>{t.categoria.nome}</span></>}
                    <span>·</span>
                    <span>por {t.aberto_por?.nome}</span>
                    {t.assignee && <><span>·</span><span>→ {t.assignee.nome}</span></>}
                  </div>
                </div>
                {/* Status + SLA */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${stConf.cor}`}>
                    <Icon size={11} />{stConf.label}
                  </span>
                  {sla && <span className={`w-2 h-2 rounded-full ${SLA_DOT[sla]}`} title="SLA" />}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <NovoTicketModal open={novoOpen} onClose={() => setNovoOpen(false)}
        onCriado={() => carregar()} />
    </div>
  )
}
