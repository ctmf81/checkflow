'use client'

import { useEffect, useState } from 'react'
import { Plus, ListChecks, AlertCircle, Pencil, Trash2, Loader2, BarChart2, X, Check, MoreVertical, Copy } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast, useConfirm } from '@/components/ui/feedback'
import { statusTarefa, StatusTarefa } from '@/lib/tarefas'

interface Lista {
  id: string
  titulo: string
  status: 'rascunho' | 'publicada' | 'encerrada'
  liberacao_em: string | null
  abertura_data_limite: string | null
  abertura_max_respostas: number | null
  total_itens: number
  total_respostas: number
}

// Rótulos do status DERIVADO (agendada/em execução/finalizada), ver lib/tarefas
const STATUS_DERIV: Record<StatusTarefa, { label: string; cor: string }> = {
  rascunho:    { label: 'Rascunho',    cor: 'bg-yellow-100 text-yellow-700' },
  agendada:    { label: 'Agendada',    cor: 'bg-indigo-100 text-indigo-700' },
  em_execucao: { label: 'Em execução', cor: 'bg-green-100 text-green-700' },
  finalizada:  { label: 'Concluída',   cor: 'bg-gray-100 text-gray-500' },
}
const FILTROS: { valor: StatusTarefa | 'todas'; label: string }[] = [
  { valor: 'todas', label: 'Todas' },
  { valor: 'rascunho', label: 'Rascunho' },
  { valor: 'agendada', label: 'Agendada' },
  { valor: 'em_execucao', label: 'Em execução' },
  { valor: 'finalizada', label: 'Concluída' },
]

function derivar(l: Lista): StatusTarefa {
  return statusTarefa(
    { status: l.status, liberacao_em: l.liberacao_em, abertura_data_limite: l.abertura_data_limite,
      abertura_max_respostas: l.abertura_max_respostas, total_respostas: l.total_respostas, grupos: [], subgrupos: [] },
    Date.now(),
  )
}

export default function TarefasPage() {
  const { unidadeAtiva, faseAssinatura } = useSession()
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [listas, setListas] = useState<Lista[]>([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [indicadores, setIndicadores] = useState<Lista | null>(null)
  const [filtro, setFiltro] = useState<StatusTarefa | 'todas'>('todas')
  const [menuAberto, setMenuAberto] = useState<string | null>(null)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('tarefa_listas')
      .select('id, titulo, status, liberacao_em, abertura_data_limite, abertura_max_respostas')
      .eq('unidade_id', unidadeAtiva.id)
      .order('criado_em', { ascending: false })

    if (data) {
      const comContagens = await Promise.all(data.map(async (l: any) => {
        const [{ count: itens }, { count: respostas }] = await Promise.all([
          supabase.from('tarefa_itens').select('id', { count: 'exact', head: true }).eq('lista_id', l.id),
          supabase.from('tarefa_execucoes').select('id', { count: 'exact', head: true }).eq('lista_id', l.id),
        ])
        return { ...l, total_itens: itens ?? 0, total_respostas: respostas ?? 0 }
      }))
      setListas(comContagens)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])

  async function novaLista() {
    if (!unidadeAtiva?.id) return
    setCriando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('tarefa_listas').insert({
      unidade_id: unidadeAtiva.id, titulo: 'Nova lista de tarefas', status: 'rascunho', criado_por: user?.id,
    }).select('id').single()
    setCriando(false)
    if (error || !data) { toast.error('Não foi possível criar a lista. Verifique sua permissão.'); return }
    router.push(`/gestao/tarefas/${data.id}`)
  }

  async function excluir(l: Lista) {
    setMenuAberto(null)
    if (!await confirm({ titulo: `Excluir "${l.titulo}"?`, mensagem: 'A lista e todas as respostas serão removidas.', confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('tarefa_listas').delete().eq('id', l.id)
    if (error) { toast.error('Não foi possível excluir.'); return }
    toast.success('Lista excluída.')
    setListas(prev => prev.filter(x => x.id !== l.id))
  }

  // Duplica a lista como RASCUNHO: copia config, itens e atribuições (grupos/subgrupos).
  async function duplicar(l: Lista) {
    setMenuAberto(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: orig } = await supabase.from('tarefa_listas').select('*').eq('id', l.id).single()
    if (!orig) { toast.error('Não foi possível duplicar.'); return }
    const { data: nova, error } = await supabase.from('tarefa_listas').insert({
      unidade_id: orig.unidade_id,
      titulo: `${orig.titulo} (cópia)`,
      descricao: orig.descricao,
      status: 'rascunho',
      liberacao_em: orig.liberacao_em,
      abertura_data_limite: orig.abertura_data_limite,
      abertura_max_respostas: orig.abertura_max_respostas,
      edicao_janela_horas: orig.edicao_janela_horas,
      notificar_whatsapp: orig.notificar_whatsapp,
      criado_por: user?.id,
    }).select('id').single()
    if (error || !nova) { toast.error('Não foi possível duplicar. Verifique sua permissão.'); return }

    const [{ data: itens }, { data: lg }, { data: ls }] = await Promise.all([
      supabase.from('tarefa_itens').select('titulo, ordem, aceita_observacao, aceita_evidencia, exige_checkin').eq('lista_id', l.id),
      supabase.from('tarefa_lista_grupos').select('grupo_id').eq('lista_id', l.id),
      supabase.from('tarefa_lista_subgrupos').select('subgrupo_id').eq('lista_id', l.id),
    ])
    if (itens?.length) await supabase.from('tarefa_itens').insert(itens.map((i: any) => ({ ...i, lista_id: nova.id })))
    if (lg?.length) await supabase.from('tarefa_lista_grupos').insert(lg.map((r: any) => ({ lista_id: nova.id, grupo_id: r.grupo_id })))
    if (ls?.length) await supabase.from('tarefa_lista_subgrupos').insert(ls.map((r: any) => ({ lista_id: nova.id, subgrupo_id: r.subgrupo_id })))

    toast.success('Lista duplicada (rascunho).')
    carregar()
  }

  const listasFiltradas = filtro === 'todas' ? listas : listas.filter(l => derivar(l) === filtro)

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Tarefas</h1>
          <p className="text-xs text-gray-400 mt-0.5">Listas de tarefas pontuais distribuídas a grupos/subgrupos · Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></p>
        </div>
        <Button onClick={novaLista} disabled={criando || faseAssinatura !== 'ativa'}
          title={faseAssinatura !== 'ativa' ? 'Criação bloqueada — período gratuito encerrado' : undefined}>
          {criando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}Nova
        </Button>
      </div>

      {/* Filtro por status */}
      {!loading && listas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {FILTROS.map(f => (
            <button key={f.valor} onClick={() => setFiltro(f.valor)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filtro === f.valor ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : listas.length === 0 ? (
        <div className="py-16 text-center">
          <ListChecks size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma lista de tarefas criada.</p>
        </div>
      ) : listasFiltradas.length === 0 ? (
        <div className="py-16 text-center">
          <ListChecks size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma lista neste filtro.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {listasFiltradas.map(l => {
            const st = derivar(l)
            return (
            <div key={l.id} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <ListChecks size={18} className="text-gray-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <Link href={`/gestao/tarefas/${l.id}`} className="font-medium text-sm text-gray-800 hover:text-orange-500 transition-colors">
                  {l.titulo}
                </Link>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{l.total_itens} tarefas</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">
                    {l.total_respostas}{l.abertura_max_respostas ? `/${l.abertura_max_respostas}` : ''} respostas
                  </span>
                </div>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_DERIV[st].cor}`}>{STATUS_DERIV[st].label}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setIndicadores(l)} title="Indicadores"
                  className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors">
                  <BarChart2 size={15} />
                </button>
                <Link href={`/gestao/tarefas/${l.id}`} title="Editar"
                  className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors">
                  <Pencil size={15} />
                </Link>
                {/* Menu ⋮ — duplicar / excluir */}
                <div className="relative">
                  <button onClick={() => setMenuAberto(menuAberto === l.id ? null : l.id)} title="Mais ações"
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                    <MoreVertical size={15} />
                  </button>
                  {menuAberto === l.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(null)} />
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
                        <button onClick={() => duplicar(l)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <Copy size={14} className="text-gray-400" />Duplicar
                        </button>
                        <button onClick={() => excluir(l)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />Excluir
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )})}
        </div>
      )}

      {indicadores && (
        <IndicadoresModal lista={indicadores} onClose={() => setIndicadores(null)} />
      )}
    </>
  )
}

// ─── Modal de indicadores de execução ────────────────────────────────────────
function IndicadoresModal({ lista, onClose }: { lista: Lista; onClose: () => void }) {
  const [execucoes, setExecucoes] = useState<{ nome: string; status: string; feitos: number; total: number; aberta_em: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data } = await supabase
        .from('tarefa_execucoes')
        .select('id, status, aberta_em, usuario:usuario_id(nome), respostas:tarefa_respostas(feito)')
        .eq('lista_id', lista.id)
        .order('aberta_em', { ascending: false })
      if (data) {
        setExecucoes(data.map((e: any) => {
          const u = Array.isArray(e.usuario) ? e.usuario[0] : e.usuario
          const resp = e.respostas ?? []
          return {
            nome: u?.nome ?? '—',
            status: e.status,
            feitos: resp.filter((r: any) => r.feito).length,
            total: lista.total_itens,
            aberta_em: e.aberta_em,
          }
        }))
      }
      setLoading(false)
    }
    carregar()
  }, [lista.id, lista.total_itens])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">Indicadores — {lista.titulo}</p>
            <p className="text-xs text-gray-400">{execucoes.length} resposta(s){lista.abertura_max_respostas ? ` de ${lista.abertura_max_respostas}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
          ) : execucoes.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">Ninguém respondeu ainda.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {execucoes.map((e, i) => (
                <li key={i} className="px-6 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{e.nome}</p>
                    <p className="text-xs text-gray-400">{new Date(e.aberta_em).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">{e.feitos}/{e.total} feitas</span>
                    {e.status === 'encerrada'
                      ? <span className="flex items-center gap-1 text-xs text-green-600"><Check size={12} />encerrada</span>
                      : <span className="text-xs text-blue-500">em andamento</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Fechar</button>
        </div>
      </div>
    </div>
  )
}
