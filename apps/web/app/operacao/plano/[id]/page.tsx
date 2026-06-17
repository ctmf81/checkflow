'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Clock, CheckCircle2, XCircle, User, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase'

type Status = 'em_moderacao_n1' | 'em_moderacao_n2' | 'corrigido' | 'nao_corrigido'

const STATUS: Record<string, { label: string; cor: string; Icon: any }> = {
  em_moderacao_n1: { label: 'Moderação N1', cor: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Clock },
  em_moderacao_n2: { label: 'Moderação N2', cor: 'bg-orange-100 text-orange-700 border-orange-200', Icon: Clock },
  corrigido:       { label: 'Corrigido', cor: 'bg-green-100 text-green-700 border-green-200', Icon: CheckCircle2 },
  nao_corrigido:   { label: 'Não corrigido', cor: 'bg-red-100 text-red-700 border-red-200', Icon: XCircle },
}
const ACAO: Record<string, string> = {
  aberto: 'Plano aberto', enviado_n2: 'Enviado para N2', devolvido_n1: 'Devolvido para N1',
  corrigido: 'Marcado como corrigido', nao_corrigido: 'Marcado como não corrigido', reaberto: 'Plano reaberto',
}

interface Evidencia { id: string; tipo: string; url: string }
interface Mov { id: string; acao: string; observacao: string | null; created_at: string; usuarios: { nome: string } | null; plano_acao_movimentacao_evidencias: Evidencia[] }
interface Plano {
  id: string; status: Status; observacao_abertura: string | null; created_at: string
  checklist_atividades: { nome: string } | null
  plano_acao_evidencias: Evidencia[]
  plano_acao_movimentacoes: Mov[]
}

function dataBR(s: string) { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

function Midias({ itens }: { itens: Evidencia[] }) {
  if (!itens?.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {itens.map(e => e.tipo === 'video'
        ? <a key={e.id} href={e.url} target="_blank" rel="noreferrer" className="text-xs text-orange-600 underline">vídeo</a>
        : <a key={e.id} href={e.url} target="_blank" rel="noreferrer"><img src={e.url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" /></a>
      )}
    </div>
  )
}

export default function PlanoOperacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [plano, setPlano] = useState<Plano | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await createClient().from('planos_acao').select(`
        id, status, observacao_abertura, created_at,
        checklist_atividades(nome),
        plano_acao_evidencias(id, tipo, url, ordem),
        plano_acao_movimentacoes(id, acao, observacao, created_at, usuarios(nome), plano_acao_movimentacao_evidencias(id, tipo, url))
      `).eq('id', id).single()
      setPlano((data as any) ?? null)
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="flex justify-center py-20"><div className="w-9 h-9 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!plano) return (
    <div className="text-center py-20 px-6">
      <FileText size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Plano de ação não encontrado ou sem acesso.</p>
      <button onClick={() => router.push('/operacao')} className="text-xs text-orange-600 mt-3">Voltar</button>
    </div>
  )

  const st = STATUS[plano.status] ?? STATUS.em_moderacao_n1
  const movs = [...(plano.plano_acao_movimentacoes ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-16 pt-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => router.push('/operacao')} className="text-gray-400 hover:text-orange-500"><ChevronLeft size={20} /></button>
        <h1 className="text-lg font-bold text-gray-800">Plano de ação</h1>
        <span className={`ml-auto inline-flex items-center gap-1 text-xs font-medium border px-2 py-0.5 rounded-full ${st.cor}`}>
          <st.Icon size={12} /> {st.label}
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Atividade</p>
        <p className="text-sm font-medium text-gray-800">{plano.checklist_atividades?.nome ?? '—'}</p>
        {plano.observacao_abertura && (
          <>
            <p className="text-xs text-gray-400 uppercase tracking-wide mt-3 mb-1">Observação de abertura</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{plano.observacao_abertura}</p>
          </>
        )}
        <Midias itens={plano.plano_acao_evidencias} />
        <p className="text-xs text-gray-400 mt-3">Aberto em {dataBR(plano.created_at)}</p>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Andamento</p>
      <div className="space-y-2">
        {movs.length === 0 && <p className="text-sm text-gray-400">Sem movimentações ainda.</p>}
        {movs.map(m => (
          <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">{ACAO[m.acao] ?? m.acao}</span>
              <span className="text-xs text-gray-400">{dataBR(m.created_at)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><User size={10} /> {m.usuarios?.nome ?? 'Equipe'}</p>
            {m.observacao && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{m.observacao}</p>}
            <Midias itens={m.plano_acao_movimentacao_evidencias} />
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">Esta é uma visualização de acompanhamento. A moderação do plano é feita pela equipe de gestão.</p>
    </div>
  )
}
