'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Ticket, Clock, CheckCircle, Inbox, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ehAdminDaEmpresa } from '@/lib/admin'
import { STATUS_ABERTOS, STATUS_FECHADOS, type TicketStatus } from '@/lib/tickets'

interface TicketItem {
  id: string; numero: number; titulo: string; prioridade: string
  status: TicketStatus; criado_em: string
  subgrupo_id: string; assignee_id: string | null; aberto_por_id: string
  subgrupo_nome: string | null
  aberto_por_nome: string | null
}

const PRIORIDADE_COR: Record<string, string> = {
  critica: 'bg-red-50 text-red-600 border-red-200',
  alta:    'bg-orange-50 text-orange-600 border-orange-200',
  media:   'bg-amber-50 text-amber-700 border-amber-200',
  baixa:   'bg-green-50 text-green-600 border-green-200',
}

const STATUS_LABEL: Record<string, string> = {
  em_tratamento:          'em tratamento',
  aguardando_informacao:  'aguardando informação',
  corrigido:              'corrigido',
  nao_corrigido:          'não corrigido',
  corrigido_parcialmente: 'corrigido parcial',
  cancelado:              'cancelado',
  improcedente:           'improcedente',
}

function dataRelativa(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export function AbaTickets({ unidadeId, empresaId }: { unidadeId: string; empresaId?: string }) {
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [meusSubgrupos, setMeusSubgrupos] = useState<Set<string>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { setLoading(false); return }
      const admin = await ehAdminDaEmpresa(sb, empresaId)
      const { data: us } = await sb.from('usuario_subgrupo').select('subgrupo_id').eq('usuario_id', user.id)

      const { data } = await sb.from('tickets').select(`
        id, numero, titulo, prioridade, status, criado_em,
        subgrupo_id, assignee_id, aberto_por_id,
        subgrupo:subgrupos(nome),
        aberto_por:usuarios!tickets_aberto_por_id_fkey(nome)
      `).eq('unidade_id', unidadeId).order('criado_em', { ascending: false })

      if (cancel) return
      setUserId(user.id)
      setMeusSubgrupos(new Set((us ?? []).map((r: any) => r.subgrupo_id)))
      setIsAdmin(admin)
      setTickets((data ?? []).map((t: any) => ({
        id: t.id, numero: t.numero, titulo: t.titulo, prioridade: t.prioridade,
        status: t.status, criado_em: t.criado_em, subgrupo_id: t.subgrupo_id,
        assignee_id: t.assignee_id, aberto_por_id: t.aberto_por_id,
        subgrupo_nome: (t.subgrupo as any)?.nome ?? null,
        aberto_por_nome: (t.aberto_por as any)?.nome ?? null,
      })))
      setLoading(false)
    })()
    return () => { cancel = true }
  }, [unidadeId, empresaId])

  const doMeuSubgrupo = (t: TicketItem) => isAdmin || meusSubgrupos.has(t.subgrupo_id)

  const paraAssumir = tickets.filter(t => t.status === 'aberto' && !t.assignee_id && doMeuSubgrupo(t))
  // Abri e devolveram para eu responder (aguardando informação) → precisa da minha ação.
  const aguardandoVoce = tickets.filter(t => t.aberto_por_id === userId && t.status === 'aguardando_informacao')
  const comigo      = tickets.filter(t => t.assignee_id === userId && STATUS_ABERTOS.includes(t.status))
  const encerrados  = tickets
    .filter(t => STATUS_FECHADOS.includes(t.status)
      && (t.assignee_id === userId || t.aberto_por_id === userId || doMeuSubgrupo(t)))
    .slice(0, 5)

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (aguardandoVoce.length === 0 && paraAssumir.length === 0 && comigo.length === 0 && encerrados.length === 0) return (
    <div className="text-center py-16">
      <Ticket size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Nenhum ticket por aqui.</p>
      <p className="text-xs text-gray-400 mt-1">Tickets do seu grupo aparecem aqui quando abertos.</p>
    </div>
  )

  function Card({ t, acao }: { t: TicketItem; acao: string }) {
    return (
      <button onClick={() => router.push(`/operacao/tickets/${t.id}`)}
        className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm active:scale-[0.99] transition-all">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400">#{String(t.numero).padStart(4, '0')}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PRIORIDADE_COR[t.prioridade] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
              {t.prioridade}
            </span>
            {STATUS_LABEL[t.status] && t.status !== 'aberto' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                {STATUS_LABEL[t.status]}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
            <Clock size={11} />{dataRelativa(t.criado_em)}
          </span>
        </div>
        <p className="text-sm text-gray-800 mb-1.5">{t.titulo}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 truncate">
            {t.aberto_por_nome ? `Aberto por ${t.aberto_por_nome}` : ''}
          </span>
          <span className="text-xs font-medium text-orange-500 flex items-center gap-0.5 flex-shrink-0">
            {acao}<ChevronRight size={13} />
          </span>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-6">
      {aguardandoVoce.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-amber-500" />
            <h2 className="text-base font-bold text-gray-800">Aguardando você</h2>
            <span className="text-xs bg-amber-100 text-amber-600 font-semibold px-2 py-0.5 rounded-full">{aguardandoVoce.length}</span>
          </div>
          <div className="space-y-2">
            {aguardandoVoce.map(t => <Card key={t.id} t={t} acao="Responder" />)}
          </div>
        </section>
      )}

      {paraAssumir.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Inbox size={16} className="text-orange-400" />
            <h2 className="text-base font-bold text-gray-800">Para assumir</h2>
            <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-2 py-0.5 rounded-full">{paraAssumir.length}</span>
          </div>
          <div className="space-y-2">
            {paraAssumir.map(t => <Card key={t.id} t={t} acao="Abrir" />)}
          </div>
        </section>
      )}

      {comigo.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Ticket size={16} className="text-blue-500" />
            <h2 className="text-base font-bold text-gray-800">Em tratamento · comigo</h2>
            <span className="text-xs bg-blue-100 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{comigo.length}</span>
          </div>
          <div className="space-y-2">
            {comigo.map(t => <Card key={t.id} t={t} acao="Continuar" />)}
          </div>
        </section>
      )}

      {encerrados.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={16} className="text-gray-300" />
            <h2 className="text-base font-bold text-gray-400">Encerrados recentes</h2>
          </div>
          <div className="space-y-2">
            {encerrados.map(t => (
              <button key={t.id} onClick={() => router.push(`/operacao/tickets/${t.id}`)}
                className="w-full text-left bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between hover:border-gray-300 transition-all">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-gray-400">#{String(t.numero).padStart(4, '0')}</span>
                  <span className="text-sm text-gray-500 ml-2">{t.titulo}</span>
                </div>
                <span className="text-xs font-medium text-gray-400 ml-2 flex-shrink-0">{STATUS_LABEL[t.status] ?? t.status}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
