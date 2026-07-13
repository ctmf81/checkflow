'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import {
  CheckSquare, ChevronRight, ChevronLeft, AlertCircle, Layers, Search,
  GitBranch, Play, History, FileText, X, ChevronDown, ChevronUp,
  ClipboardList, Clock, User, CheckCircle, XCircle, AlertTriangle,
  RotateCcw, ExternalLink, Image as ImageIcon, Video,
  Bot, Send, Loader2, MessageSquare, Ticket, ListChecks,
} from 'lucide-react'
import NovoTicketModal from '@/components/tickets/NovoTicketModal'
import { AbaTarefas } from './AbaTarefas'
import { AbaTickets } from './AbaTickets'
import { WORKFLOWS_HABILITADO } from '@/lib/features'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { ONBOARDING_OPERACAO } from '@/components/onboarding/configs'
import { visivelPorSubgrupo, checklistVisivelOperador, documentoVisivelOperador } from '@/lib/visibilidade'
import { ehAdminDaEmpresa } from '@/lib/admin'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { listaDisponivel } from '@/lib/tarefas'
import { videoEmbedUrl } from '@/lib/videoEmbed'
import { carregarListaOffline, salvarListaOffline } from '@/lib/offlineList'
import { buscarDefinicaoChecklist } from '@/lib/checklistFetch'
import { salvarChecklistCache, chaveChecklist } from '@/lib/checklistCache'
import { buscarCatalogo, salvarCatalogoCache } from '@/lib/catalogoCache'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Aba = 'checklists' | 'tarefas' | 'tickets' | 'historico' | 'documentos'

interface Checklist {
  id: string; nome: string; descricao: string | null
  total_atividades: number; subgrupo_id: string | null
  subgrupo_nome: string | null; grupo_id: string | null; grupo_nome: string | null
}
interface GrupoAgrupado {
  id: string; nome: string
  subgrupos: { id: string | null; nome: string | null; checklists: Checklist[] }[]
}
interface ItemWorkflowLiberado {
  item_execucao_id: string; checklist_id: string; checklist_nome: string
  workflow_nome: string; estagio_nome: string; subgrupo_nome: string | null
}
// Execução criada por um agendamento, aguardando que um operador a execute
interface ExecucaoAgendada {
  execucao_id: string; checklist_id: string; checklist_nome: string; criado_em: string
}
// Execução que o operador iniciou/assumiu mas não finalizou (pendência)
interface ExecucaoNaoFinalizada {
  execucao_id: string; checklist_id: string; checklist_nome: string; iniciado_em: string
}

interface Execucao {
  id: string; checklist_nome: string; data_execucao: string
  status: 'em_andamento' | 'concluido' | 'nao_executado'
  resultado: 'aprovado' | 'reprovado' | null
  pdf_url: string | null
  executado_por_nome: string | null
  planos: PlanoResumo[]
}
interface PlanoResumo {
  id: string; status: string; atividade_nome: string
  ultima_mov: { acao: string; usuario_nome: string | null; criado_em: string } | null
}

interface Documento {
  id: string; nome: string; descricao: string | null
  tipo: 'pop' | 'it' | 'consulta_inteligente'; arquivo_url: string | null
  subgrupo_nome: string | null; grupo_nome: string | null
}
interface Etapa {
  id: string; titulo: string | null; conteudo: string | null
  video_id: string | null; ordem: number
  imagens: { id: string; url: string; ordem: number }[]
}

// ─── Helpers visuais ──────────────────────────────────────────────────────────

const STATUS_EXEC: Record<string, { label: string; cor: string; icon: React.ReactNode }> = {
  concluido:      { label: 'Concluído',      cor: 'text-green-600 bg-green-50 border-green-200',  icon: <CheckCircle size={12} /> },
  em_andamento:   { label: 'Em andamento',   cor: 'text-amber-600 bg-amber-50 border-amber-200',  icon: <Clock size={12} /> },
  nao_executado:  { label: 'Não executado',  cor: 'text-gray-500 bg-gray-50 border-gray-200',     icon: <XCircle size={12} /> },
}
const STATUS_PLANO: Record<string, { label: string; cor: string }> = {
  em_moderacao_n1: { label: 'Aguarda N1',   cor: 'text-amber-700 bg-amber-50 border-amber-300' },
  em_moderacao_n2: { label: 'Aguarda N2',   cor: 'text-orange-700 bg-orange-50 border-orange-300' },
  corrigido:       { label: 'Corrigido',     cor: 'text-green-700 bg-green-50 border-green-300' },
  nao_corrigido:   { label: 'Não corrigido', cor: 'text-red-700 bg-red-50 border-red-300' },
  reaberto:        { label: 'Reaberto',      cor: 'text-violet-700 bg-violet-50 border-violet-300' },
}

// Resume o status dos planos de ação de uma execução reprovada, para exibir
// junto do badge "Reprovado" (ex: "Aguarda N1", "Corrigido")
function resumoPlanos(planos: { status: string }[]): { label: string; cor: string } | null {
  if (!planos.length) return null
  if (planos.some(p => p.status === 'em_moderacao_n2')) return { label: 'Aguarda N2', cor: 'amber' }
  if (planos.some(p => p.status === 'em_moderacao_n1' || p.status === 'reaberto')) return { label: 'Aguarda N1', cor: 'amber' }
  if (planos.some(p => p.status === 'nao_corrigido')) return { label: 'Não corrigido', cor: 'red' }
  if (planos.every(p => p.status === 'corrigido')) return { label: 'Corrigido', cor: 'green' }
  return null
}
const TIPO_DOC: Record<string, { label: string; cor: string }> = {
  pop:                  { label: 'POP',    cor: 'text-blue-600 bg-blue-50 border-blue-200' },
  it:                   { label: 'IT',     cor: 'text-violet-600 bg-violet-50 border-violet-200' },
  consulta_inteligente: { label: 'Consulta', cor: 'text-green-600 bg-green-50 border-green-200' },
}

function dataRelativa(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m} min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  return `${Math.floor(h / 24)}d atrás`
}

// Agrupa uma lista plana de checklists em grupos/subgrupos (e os sem grupo).
// Reutilizado pelo carregamento online e pela lista offline (do cache).
function agruparChecklists(visiveis: Checklist[]): { grupos: GrupoAgrupado[]; semGrupo: Checklist[] } {
  const gruposMap = new Map<string, GrupoAgrupado>()
  const semGrupoList: Checklist[] = []
  for (const cl of visiveis) {
    if (!cl.grupo_id) { semGrupoList.push(cl); continue }
    if (!gruposMap.has(cl.grupo_id)) gruposMap.set(cl.grupo_id, { id: cl.grupo_id, nome: cl.grupo_nome!, subgrupos: [] })
    const grupo = gruposMap.get(cl.grupo_id)!
    const subId = cl.subgrupo_id ?? '__sem__'
    let sub = grupo.subgrupos.find(s => s.id === subId)
    if (!sub) { sub = { id: cl.subgrupo_id, nome: cl.subgrupo_nome, checklists: [] }; grupo.subgrupos.push(sub) }
    sub.checklists.push(cl)
  }
  return { grupos: Array.from(gruposMap.values()), semGrupo: semGrupoList }
}

// Pré-carrega rotas de execução num iframe oculto enquanto ONLINE. Uma
// navegação real faz o service worker cachear o HTML + TODOS os chunks JS da
// página — o que permite a página abrir offline depois (prefetch sozinho não
// basta para rotas dinâmicas do App Router). Sequencial e em background.
let preloadOfflineRodando = false
async function preCarregarRotasOffline(urls: string[]) {
  if (preloadOfflineRodando || typeof document === 'undefined' || urls.length === 0) return
  preloadOfflineRodando = true
  try {
    for (const url of urls) {
      await new Promise<void>(resolve => {
        const iframe = document.createElement('iframe')
        iframe.setAttribute('aria-hidden', 'true')
        iframe.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;border:0;opacity:0'
        let done = false
        const cleanup = () => { if (done) return; done = true; try { iframe.remove() } catch { /* noop */ } resolve() }
        iframe.onload = () => setTimeout(cleanup, 2000) // tempo p/ os chunks carregarem
        iframe.onerror = () => cleanup()
        setTimeout(cleanup, 15000) // timeout de segurança
        iframe.src = url
        document.body.appendChild(iframe)
      })
    }
  } finally {
    preloadOfflineRodando = false
  }
}

// ─── ABA: Checklists (conteúdo original) ────────────────────────────────────

function AbaChecklists({ grupos, semGrupo, itensWorkflow, agendadas, naoFinalizadas, onNaoExecutado, busca, setBusca }: {
  grupos: GrupoAgrupado[]; semGrupo: Checklist[]
  itensWorkflow: ItemWorkflowLiberado[]; agendadas: ExecucaoAgendada[]
  naoFinalizadas: ExecucaoNaoFinalizada[]
  onNaoExecutado: () => void
  busca: string
  setBusca: (v: string) => void
}) {
  const router = useRouter()

  // Abre a execução. Offline, a navegação client-side do Next falha (busca RSC
  // do servidor) — então força uma navegação completa, que o service worker
  // serve do cache. Online mantém o SPA (rápido).
  function abrirChecklist(id: string) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      window.location.href = `/operacao/${id}`
    } else {
      router.push(`/operacao/${id}`)
    }
  }

  // Não-execução com motivo (operador comum não pode descartar livremente)
  const [naoExecAlvo, setNaoExecAlvo] = useState<ExecucaoNaoFinalizada | null>(null)
  const [motivosNaoExec, setMotivosNaoExec] = useState<{ id: string; descricao: string }[]>([])
  const [motivoSel, setMotivoSel] = useState('')
  const [obsNaoExec, setObsNaoExec] = useState('')
  const [carregandoMotivos, setCarregandoMotivos] = useState(false)
  const [salvandoNaoExec, setSalvandoNaoExec] = useState(false)

  async function abrirNaoExec(nf: ExecucaoNaoFinalizada) {
    setNaoExecAlvo(nf)
    setMotivoSel('')
    setObsNaoExec('')
    setCarregandoMotivos(true)
    const sb = createClient()
    const { data } = await sb.from('checklist_nao_execucao_motivos')
      .select('motivo:motivo_id(id, descricao, tipo)')
      .eq('checklist_id', nf.checklist_id)
    const lista = (data ?? [])
      .map((m: any) => Array.isArray(m.motivo) ? m.motivo[0] : m.motivo)
      .filter((m: any) => m && m.tipo === 'checklist')
      .map((m: any) => ({ id: m.id, descricao: m.descricao }))
    setMotivosNaoExec(lista)
    setCarregandoMotivos(false)
  }

  async function confirmarNaoExec() {
    if (!naoExecAlvo || !motivoSel) return
    setSalvandoNaoExec(true)
    const sb = createClient()
    // Descarta as respostas dadas e salva o checklist como não executado + motivo
    await sb.from('checklist_execucao_respostas').delete().eq('execucao_id', naoExecAlvo.execucao_id)
    await sb.from('checklist_execucoes').update({
      status: 'nao_executado',
      resultado: null,
      motivo_nao_execucao_id: motivoSel,
      motivo_nao_execucao_obs: obsNaoExec.trim() || null,
    }).eq('id', naoExecAlvo.execucao_id)
    setSalvandoNaoExec(false)
    setNaoExecAlvo(null)
    onNaoExecutado()
  }

  function filtrar(cls: Checklist[]) {
    if (!busca.trim()) return cls
    return cls.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
  }

  const gruposFiltrados = grupos
    .map(g => ({ ...g, subgrupos: g.subgrupos.map(s => ({ ...s, checklists: filtrar(s.checklists) })).filter(s => s.checklists.length > 0) }))
    .filter(g => g.subgrupos.length > 0)
  const semGrupoFiltrado = filtrar(semGrupo)
  const semResultado = busca && gruposFiltrados.length === 0 && semGrupoFiltrado.length === 0
  // Campo de busca só faz sentido com muitos modelos — com poucos, é ruído.
  const totalChecklists =
    grupos.reduce((n, g) => n + g.subgrupos.reduce((m, s) => m + s.checklists.length, 0), 0) + semGrupo.length

  return (
    <div className="space-y-6">
      {/* Não finalizados — pendência incômoda no topo */}
      {naoFinalizadas.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className="text-red-500" />
            <h2 className="text-base font-bold text-gray-800">Não finalizados</h2>
            <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">{naoFinalizadas.length}</span>
          </div>
          <div className="space-y-2">
            {naoFinalizadas.map(nf => (
              <div key={nf.execucao_id}
                className="w-full bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <AlertCircle size={16} className="text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm">{nf.checklist_nome}</p>
                    <p className="text-xs text-red-600 mt-0.5">Iniciado e não finalizado · {dataRelativa(nf.iniciado_em)}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => router.push(`/operacao/${nf.checklist_id}?exec=${nf.execucao_id}`)}
                    className="flex-1 sm:flex-none text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors">
                    Continuar
                  </button>
                  <button
                    onClick={() => abrirNaoExec(nf)}
                    title="Registrar não execução com motivo"
                    className="flex-1 sm:flex-none text-xs font-medium text-red-600 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                    Não executar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal: não execução com motivo (operador comum) */}
      {naoExecAlvo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setNaoExecAlvo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Não executar checklist</h3>
              <p className="text-xs text-gray-500 mt-0.5">{naoExecAlvo.checklist_nome}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                As respostas já preenchidas serão <strong>descartadas</strong> e o checklist será salvo como não executado.
              </p>
              {carregandoMotivos ? (
                <p className="text-sm text-gray-400 text-center py-2">Carregando motivos...</p>
              ) : motivosNaoExec.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhum motivo de não execução cadastrado para este checklist. Você precisa finalizá-lo.
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Motivo</label>
                    <select value={motivoSel} onChange={e => setMotivoSel(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                      <option value="">Selecione...</option>
                      {motivosNaoExec.map(m => <option key={m.id} value={m.id}>{m.descricao}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Observação (opcional)</label>
                    <textarea value={obsNaoExec} onChange={e => setObsNaoExec(e.target.value)} rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setNaoExecAlvo(null)} className="text-sm text-gray-500 px-3 py-2">Cancelar</button>
              {motivosNaoExec.length > 0 && (
                <button onClick={confirmarNaoExec} disabled={!motivoSel || salvandoNaoExec}
                  className="text-sm font-medium bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {salvandoNaoExec ? 'Salvando...' : 'Confirmar não execução'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Agendados pendentes */}
      {agendadas.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-amber-500" />
            <h2 className="text-base font-bold text-gray-800">Agendados pendentes</h2>
            <span className="text-xs bg-amber-100 text-amber-600 font-semibold px-2 py-0.5 rounded-full">{agendadas.length}</span>
          </div>
          <div className="space-y-2">
            {agendadas.map(ag => (
              <button key={ag.execucao_id}
                onClick={() => router.push(`/operacao/${ag.checklist_id}?exec=${ag.execucao_id}`)}
                className="w-full text-left bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 flex items-center gap-3 hover:border-amber-400 hover:shadow-sm active:scale-[0.99] transition-all">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock size={16} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{ag.checklist_nome}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Agendado · {dataRelativa(ag.criado_em)}</p>
                </div>
                <ChevronRight size={16} className="text-amber-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Workflows */}
      {itensWorkflow.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <GitBranch size={16} className="text-violet-500" />
            <h2 className="text-base font-bold text-gray-800">Workflows em andamento</h2>
            <span className="text-xs bg-violet-100 text-violet-600 font-semibold px-2 py-0.5 rounded-full">{itensWorkflow.length}</span>
          </div>
          <div className="space-y-2">
            {itensWorkflow.map(item => (
              <button key={item.item_execucao_id}
                onClick={() => router.push(`/operacao/${item.checklist_id}?wf_item=${item.item_execucao_id}`)}
                className="w-full text-left bg-violet-50 border border-violet-200 rounded-xl px-4 py-3.5 flex items-center gap-3 hover:border-violet-400 hover:shadow-sm active:scale-[0.99] transition-all">
                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Play size={16} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{item.checklist_nome}</p>
                  <p className="text-xs text-violet-600 mt-0.5">{item.workflow_nome} · {item.estagio_nome}</p>
                  {item.subgrupo_nome && <p className="text-xs text-gray-400 mt-0.5">{item.subgrupo_nome}</p>}
                </div>
                <ChevronRight size={16} className="text-violet-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Busca — só aparece a partir de 6 modelos de checklist */}
      {totalChecklists >= 6 && (
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar checklist..."
            className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
      )}

      {semResultado && <div className="text-center py-12"><p className="text-gray-400 text-sm">Nenhum resultado para "{busca}"</p></div>}

      {gruposFiltrados.map(grupo => (
        <section key={grupo.id}>
          <div className="flex items-center gap-2 mb-3">
            <Layers size={16} className="text-orange-400" />
            <h2 className="text-base font-bold text-gray-800">{grupo.nome}</h2>
          </div>
          {grupo.subgrupos.map(sub => (
            <div key={sub.id ?? 'sem'} className="mb-4">
              {sub.nome && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">{sub.nome}</p>}
              <div className="space-y-2">
                {sub.checklists.map(cl => (
                  <ChecklistCard key={cl.id} checklist={cl} onClick={() => abrirChecklist(cl.id)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {semGrupoFiltrado.length > 0 && (
        <section>
          {grupos.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare size={16} className="text-gray-400" />
              <h2 className="text-base font-bold text-gray-800">Outros</h2>
            </div>
          )}
          <div className="space-y-2">
            {semGrupoFiltrado.map(cl => (
              <ChecklistCard key={cl.id} checklist={cl} onClick={() => abrirChecklist(cl.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── ABA: Histórico ───────────────────────────────────────────────────────────

function AbaHistorico({ unidadeId }: { unidadeId: string }) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function carregar() {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { setLoading(false); return }

        // execuções do usuário nesta unidade
        const { data: execs, error: execErr } = await sb
          .from('checklist_execucoes')
          .select('id, status, resultado, pdf_url, data_execucao, checklists(nome)')
          .eq('unidade_id', unidadeId)
          .eq('executado_por', user.id)
          .order('data_execucao', { ascending: false })
          .limit(50)

        if (execErr || !execs || execs.length === 0) { setLoading(false); return }

        const execIds = execs.map((e: any) => e.id)

        // Planos das execuções
        const { data: planos } = await sb.from('planos_acao')
          .select(`
            id, status, checklist_execucao_id,
            checklist_atividades(nome),
            plano_acao_movimentacoes(acao, criado_em:created_at, usuarios(nome))
          `)
          .in('checklist_execucao_id', execIds)

        const planosPorExec: Record<string, PlanoResumo[]> = {}
        for (const p of (planos ?? [])) {
          const movs = (p.plano_acao_movimentacoes ?? []) as any[]
          const ultima = movs.sort((a: any, b: any) =>
            new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
          )[0] ?? null

          const item: PlanoResumo = {
            id: p.id,
            status: p.status,
            atividade_nome: (p.checklist_atividades as any)?.nome ?? '—',
            ultima_mov: ultima ? {
              acao: ultima.acao,
              usuario_nome: (ultima.usuarios as any)?.nome ?? null,
              criado_em: ultima.criado_em,
            } : null,
          }
          const execId = p.checklist_execucao_id
          if (!planosPorExec[execId]) planosPorExec[execId] = []
          planosPorExec[execId].push(item)
        }

        setExecucoes(execs.map((e: any) => ({
          id: e.id,
          checklist_nome: (e.checklists as any)?.nome ?? '—',
          data_execucao: e.data_execucao,
          status: e.status,
          resultado: e.resultado ?? null,
          pdf_url: e.pdf_url ?? null,
          executado_por_nome: null,
          planos: planosPorExec[e.id] ?? [],
        })))
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [unidadeId])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  if (execucoes.length === 0) return (
    <div className="text-center py-16">
      <History size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Nenhuma execução encontrada.</p>
      <p className="text-xs text-gray-400 mt-1">Execute um checklist para ver o histórico aqui.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {execucoes.map(exec => {
        const st = STATUS_EXEC[exec.status] ?? STATUS_EXEC.concluido
        const pa = exec.resultado === 'reprovado' ? resumoPlanos(exec.planos) : null
        // "Concluído" é redundante no histórico (toda execução aqui já terminou):
        // aprovada mostra só a data, reprovada mostra o badge de tratamento. Os
        // demais status (Em andamento, Não executado) continuam aparecendo.
        const mostrarStatus = exec.status !== 'concluido'
        const aberto = expandido === exec.id
        return (
          <div key={exec.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Linha principal */}
            <button className="w-full text-left px-4 py-3.5 flex items-center gap-3"
              onClick={() => setExpandido(aberto ? null : exec.id)}>
              <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <ClipboardList size={16} className="text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{exec.checklist_nome}</p>
                {/* Título, tempo e status cada um em sua própria linha */}
                <p className="text-xs text-gray-400 mt-1">{dataRelativa(exec.data_execucao)}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {exec.resultado === 'reprovado' && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${
                      pa?.cor === 'green'  ? 'bg-green-50 text-green-600 border-green-200' :
                      pa?.cor === 'amber'  ? 'bg-amber-50 text-amber-600 border-amber-200' :
                      pa?.cor === 'red'    ? 'bg-red-50 text-red-600 border-red-200' :
                      'bg-red-50 text-red-500 border-red-200'
                    }`}>
                      {pa ? (pa.cor === 'amber' ? pa.label : `Reprovado · ${pa.label}`) : 'Reprovado'}
                    </span>
                  )}
                  {mostrarStatus && (
                    <span className={`flex items-center gap-1 text-xs border font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${st.cor}`}>
                      {st.icon}{st.label}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); router.push(`/operacao/execucao/${exec.id}`) }}
                  title="Abrir execução"
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-orange-50 hover:text-orange-500 text-gray-400 transition-colors">
                  <FileText size={14} />
                </button>
                {aberto ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </div>
            </button>

            {/* Detalhes expandidos */}
            {aberto && (
              <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                {/* Planos de ação */}
                {exec.planos.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Planos de ação</p>
                    <div className="space-y-2">
                      {exec.planos.map(pl => {
                        const sp = STATUS_PLANO[pl.status] ?? { label: pl.status, cor: 'text-gray-500 bg-gray-50 border-gray-200' }
                        return (
                          <div key={pl.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-700 truncate">{pl.atividade_nome}</p>
                                {pl.ultima_mov && (
                                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                    <User size={10} />
                                    {pl.ultima_mov.usuario_nome ?? 'Desconhecido'} · {dataRelativa(pl.ultima_mov.criado_em)}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className={`text-xs border font-medium px-2 py-0.5 rounded-full ${sp.cor}`}>{sp.label}</span>
                                <button
                                  onClick={() => router.push(`/operacao/plano/${pl.id}`)}
                                  className="p-1 text-gray-300 hover:text-orange-500 transition-colors"
                                  title="Ver plano">
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    <CheckCircle size={13} className="text-green-400" />
                    Nenhum plano de ação aberto nesta execução
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── ABA: Documentos ─────────────────────────────────────────────────────────

function AbaDocumentos({ unidadeId, empresaId }: { unidadeId: string; empresaId?: string }) {
  const { flagsHabilitadas } = useSession()
  // Consulta Inteligente = característica 'ia' do plano (opt-in: null = sem restrição).
  const iaHabilitada = flagsHabilitadas === null || flagsHabilitadas.has('ia')
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(true)
  const [docAberto, setDocAberto] = useState<Documento | null>(null)
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [etapaIdx, setEtapaIdx] = useState(0)
  const [loadingEtapas, setLoadingEtapas] = useState(false)

  // Estado da Consulta Inteligente
  const [consultaHistorico, setConsultaHistorico] = useState<{ pergunta: string; resposta: string }[]>([])
  const [consultando, setConsultando] = useState(false)

  useEffect(() => {
    async function carregar() {
      try {
        const sb = createClient()

        const { data: { user } } = await sb.auth.getUser()
        if (!user) { setLoading(false); return }
        const isAdmin = await ehAdminDaEmpresa(sb, empresaId)

        let subgrupoIds: string[] = []
        let grupoIds: string[] = []

        if (isAdmin) {
          // Admin "faz parte" de todos os grupos/subgrupos da unidade
          const { data: gs } = await sb.from('grupos').select('id').eq('unidade_id', unidadeId).eq('status', 'ativo')
          grupoIds = (gs ?? []).map((g: any) => g.id)
          const { data: ss } = grupoIds.length
            ? await sb.from('subgrupos').select('id').in('grupo_id', grupoIds).eq('status', 'ativo')
            : { data: [] }
          subgrupoIds = (ss ?? []).map((s: any) => s.id)
        } else {
          // 1. Subgrupos do usuário — busca simples sem inner join filtrado
          const { data: us } = await sb
            .from('usuario_subgrupo')
            .select('subgrupo_id, subgrupos(grupo_id, grupos(unidade_id))')
            .eq('usuario_id', user.id)

          // Filtra só os que pertencem a esta unidade
          const usUnidade = (us ?? []).filter((r: any) => {
            const grp = r.subgrupos?.grupos
            return grp?.unidade_id === unidadeId
          })

          subgrupoIds = usUnidade.map((r: any) => r.subgrupo_id)
          grupoIds = [...new Set(
            usUnidade.map((r: any) => r.subgrupos?.grupo_id).filter(Boolean) as string[]
          )]
        }

        // 2. Busca documentos: começa pelos da unidade, depois filtra por subgrupo/grupo
        let query = sb.from('documentos')
          .select('id, nome, descricao, tipo, arquivo_url, subgrupo_id, grupo_id, subgrupos(nome), grupos(nome)')
          .eq('status', 'ativo')
          .order('nome')

        // Monta filtro OR em partes
        const orParts = [`unidade_id.eq.${unidadeId}`]
        if (subgrupoIds.length) orParts.push(`subgrupo_id.in.(${subgrupoIds.join(',')})`)
        if (grupoIds.length) orParts.push(`grupo_id.in.(${grupoIds.join(',')})`)
        query = query.or(orParts.join(','))

        const { data: docs } = await query

        setDocumentos((docs ?? [])
          // Consulta Inteligente: fora se sem arquivo OU se o plano não inclui IA
          .filter((d: any) => !(d.tipo === 'consulta_inteligente' && (!d.arquivo_url || !iaHabilitada)))
          .map((d: any) => ({
            id: d.id,
            nome: d.nome,
            descricao: d.descricao,
            tipo: d.tipo,
            arquivo_url: d.arquivo_url,
            subgrupo_nome: (d.subgrupos as any)?.nome ?? null,
            grupo_nome: (d.grupos as any)?.nome ?? null,
          })))
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [unidadeId, empresaId, iaHabilitada])

  async function abrirDocumento(doc: Documento) {
    setDocAberto(doc)
    setEtapaIdx(0)
    setConsultaHistorico([])

    if (doc.tipo === 'consulta_inteligente') return // Consulta inteligente não carrega etapas

    if (!doc.arquivo_url) {
      setLoadingEtapas(true)
      const sb = createClient()
      const { data: etapasData } = await sb
        .from('documento_etapas')
        .select('id, titulo, conteudo, video_id, ordem, etapa_imagens(id, url, ordem)')
        .eq('documento_id', doc.id)
        .order('ordem')
      setEtapas((etapasData ?? []).map((e: any) => ({
        ...e,
        imagens: (e.etapa_imagens ?? []).sort((a: any, b: any) => a.ordem - b.ordem),
      })))
      setLoadingEtapas(false)
    }
  }

  async function consultar(pergunta: string) {
    if (!docAberto || consultando) return
    setConsultando(true)
    const novaPergunta = { pergunta, resposta: '' }
    setConsultaHistorico(prev => [...prev, novaPergunta])
    const idx = consultaHistorico.length

    try {
      const sb = createClient()
      const { data: { session } } = await sb.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada')

      const res = await fetch('/api/documentos/consultar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ documento_id: docAberto.id, pergunta }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Erro na consulta' }))
        setConsultaHistorico(prev => prev.map((h, i) => i === idx ? { ...h, resposta: `❌ ${err.error ?? 'Erro desconhecido'}` } : h))
        return
      }

      // Lê stream chunk a chunk
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let textoCompleto = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        textoCompleto += decoder.decode(value, { stream: true })
        setConsultaHistorico(prev => prev.map((h, i) => i === idx ? { ...h, resposta: textoCompleto } : h))
      }
    } catch (err: any) {
      setConsultaHistorico(prev => prev.map((h, i) => i === idx ? { ...h, resposta: `❌ ${err.message ?? 'Erro ao consultar'}` } : h))
    } finally {
      setConsultando(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  if (documentos.length === 0) return (
    <div className="text-center py-16">
      <FileText size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Nenhum documento disponível.</p>
      <p className="text-xs text-gray-400 mt-1">Os documentos da sua área aparecerão aqui.</p>
    </div>
  )

  return (
    <>
      <div className="space-y-2">
        {documentos.map(doc => {
          const tp = TIPO_DOC[doc.tipo] ?? { label: doc.tipo, cor: 'text-gray-500 bg-gray-50 border-gray-200' }
          return (
            <button key={doc.id} onClick={() => abrirDocumento(doc)}
              className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-4 flex items-center gap-3 hover:border-orange-300 hover:shadow-sm active:scale-[0.99] transition-all">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText size={18} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-800 text-sm">{doc.nome}</p>
                  <span className={`text-xs border font-medium px-1.5 py-0.5 rounded-full ${tp.cor}`}>{tp.label}</span>
                </div>
                {doc.descricao && <p className="text-xs text-gray-400 mt-0.5 truncate">{doc.descricao}</p>}
                {(doc.subgrupo_nome || doc.grupo_nome) && (
                  <p className="text-xs text-gray-400 mt-0.5">{doc.subgrupo_nome ?? doc.grupo_nome}</p>
                )}
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </button>
          )
        })}
      </div>

      {/* Viewer de documento */}
      {docAberto && (
        <ViewerDocumento
          doc={docAberto}
          etapas={etapas}
          etapaIdx={etapaIdx}
          setEtapaIdx={setEtapaIdx}
          loadingEtapas={loadingEtapas}
          onClose={() => { setDocAberto(null); setEtapas([]); setConsultaHistorico([]) }}
          consultaHistorico={consultaHistorico}
          consultando={consultando}
          onConsultar={consultar}
        />
      )}
    </>
  )
}

// Carrossel quadrado das imagens de uma etapa (uma por vez)
function EtapaImagens({ imagens }: { imagens: { id: string; url: string }[] }) {
  const [idx, setIdx] = useState(0)
  const i = Math.min(idx, imagens.length - 1)
  return (
    <div className="space-y-2">
      <div className="relative w-full aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imagens[i].url} alt="" className="w-full h-full object-contain" />
        {imagens.length > 1 && (
          <>
            <button onClick={() => setIdx(Math.max(0, i - 1))} disabled={i === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/60">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setIdx(Math.min(imagens.length - 1, i + 1))} disabled={i === imagens.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/60">
              <ChevronRight size={18} />
            </button>
            <span className="absolute bottom-2 right-2 text-xs text-white bg-black/50 rounded-full px-2 py-0.5">
              {i + 1}/{imagens.length}
            </span>
          </>
        )}
      </div>
      {imagens.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {imagens.map((img, k) => (
            <button key={img.id} onClick={() => setIdx(k)}
              className={`w-2 h-2 rounded-full transition-colors ${k === i ? 'bg-orange-500' : 'bg-gray-300'}`} />
          ))}
        </div>
      )}
    </div>
  )
}

function ViewerDocumento({ doc, etapas, etapaIdx, setEtapaIdx, loadingEtapas, onClose,
  consultaHistorico, consultando, onConsultar }: {
  doc: Documento; etapas: Etapa[]; etapaIdx: number
  setEtapaIdx: (i: number) => void; loadingEtapas: boolean; onClose: () => void
  consultaHistorico: { pergunta: string; resposta: string }[]
  consultando: boolean
  onConsultar: (pergunta: string) => void
}) {
  const etapa = etapas[etapaIdx]

  return (
    <div className="fixed inset-0 bg-black/60 flex flex-col z-50">
      {/* Header */}
      <div className="bg-white flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {doc.tipo === 'consulta_inteligente' && (
            <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Bot size={14} className="text-green-600" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 text-sm truncate">{doc.nome}</p>
            {doc.tipo === 'consulta_inteligente'
              ? <p className="text-xs text-green-600 mt-0.5">Consulta Inteligente · IA</p>
              : etapas.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">Etapa {etapaIdx + 1} de {etapas.length}</p>
                )
            }
          </div>
        </div>
        <button onClick={onClose} className="ml-3 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex-shrink-0">
          <X size={18} />
        </button>
      </div>

      {/* ─── Consulta Inteligente (RAG) ──────────────────────────────────────── */}
      {doc.tipo === 'consulta_inteligente' && (
        <ConsultaInteligente
          documentoNome={doc.nome}
          historico={consultaHistorico}
          consultando={consultando}
          onConsultar={onConsultar}
        />
      )}

      {/* ─── Viewer normal (arquivo / etapas) ───────────────────────────────── */}
      {doc.tipo !== 'consulta_inteligente' && (
        <>
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {/* Arquivo direto (PDF / imagem) */}
            {doc.arquivo_url && (
              <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
                {doc.arquivo_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doc.arquivo_url} alt={doc.nome} className="max-w-full rounded-xl shadow" />
                ) : (
                  <>
                    <iframe src={doc.arquivo_url} className="w-full rounded-xl shadow bg-white" style={{ height: 'calc(100vh - 140px)' }} />
                    <a href={doc.arquivo_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-orange-500 font-medium hover:underline">
                      <ExternalLink size={14} />Abrir em nova aba
                    </a>
                  </>
                )}
              </div>
            )}

            {/* Etapas (POP / IT) */}
            {!doc.arquivo_url && (
              loadingEtapas ? (
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : etapas.length === 0 ? (
                <div className="text-center py-16">
                  <FileText size={36} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Este documento não possui conteúdo cadastrado.</p>
                </div>
              ) : etapa ? (
                <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
                  {etapa.titulo && <h2 className="text-lg font-bold text-gray-800">{etapa.titulo}</h2>}
                  {videoEmbedUrl(etapa.video_id) && (
                    <div className="rounded-xl overflow-hidden shadow aspect-video">
                      <iframe src={videoEmbedUrl(etapa.video_id)!} className="w-full h-full" allowFullScreen title={etapa.titulo ?? 'Vídeo'} />
                    </div>
                  )}
                  {etapa.imagens.length > 0 && (
                    <EtapaImagens key={etapa.id} imagens={etapa.imagens} />
                  )}
                  {etapa.conteudo && (
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{etapa.conteudo}</p>
                    </div>
                  )}
                </div>
              ) : null
            )}
          </div>

          {/* Navegação de etapas */}
          {!doc.arquivo_url && etapas.length > 1 && (
            <div className="bg-white border-t border-gray-200 flex items-center gap-3 px-4 py-3 flex-shrink-0">
              <button onClick={() => setEtapaIdx(Math.max(0, etapaIdx - 1))} disabled={etapaIdx === 0}
                className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 transition-colors">
                ← Anterior
              </button>
              <div className="flex gap-1">
                {etapas.map((_, i) => (
                  <button key={i} onClick={() => setEtapaIdx(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${i === etapaIdx ? 'bg-orange-500' : 'bg-gray-200'}`} />
                ))}
              </div>
              <button onClick={() => setEtapaIdx(Math.min(etapas.length - 1, etapaIdx + 1))} disabled={etapaIdx === etapas.length - 1}
                className="flex-1 py-2.5 text-sm font-medium bg-orange-500 text-white rounded-xl disabled:opacity-40 hover:bg-orange-600 transition-colors">
                Próxima →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── ConsultaInteligente (UI de chat + RAG) ───────────────────────────────────

function ConsultaInteligente({ documentoNome, historico, consultando, onConsultar }: {
  documentoNome: string
  historico: { pergunta: string; resposta: string }[]
  consultando: boolean
  onConsultar: (pergunta: string) => void
}) {
  const [pergunta, setPergunta] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Rola para baixo a cada nova mensagem/chunk
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [historico])

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const p = pergunta.trim()
    if (!p || consultando) return
    setPergunta('')
    onConsultar(p)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Área de conversa */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {historico.length === 0 ? (
          /* Estado inicial */
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
              <Bot size={28} className="text-green-600" />
            </div>
            <p className="font-semibold text-gray-700 text-base">Consulta Inteligente</p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs leading-relaxed">
              Faça perguntas sobre o conteúdo de <span className="font-medium text-gray-600">"{documentoNome}"</span>.
              A IA responderá com base no documento.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 w-full max-w-xs">
              {[
                'Qual o procedimento descrito neste documento?',
                'Quais são os itens de segurança necessários?',
                'Resumo os pontos principais.',
              ].map(sugestao => (
                <button key={sugestao}
                  onClick={() => { setPergunta(sugestao) }}
                  className="text-xs text-left bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-600 hover:border-green-300 hover:bg-green-50 transition-colors">
                  "{sugestao}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          historico.map((h, i) => (
            <div key={i} className="space-y-3">
              {/* Pergunta do usuário */}
              <div className="flex justify-end">
                <div className="bg-green-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%]">
                  <p className="text-sm leading-relaxed">{h.pergunta}</p>
                </div>
              </div>

              {/* Resposta da IA */}
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={13} className="text-green-600" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] shadow-sm">
                  {h.resposta ? (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{h.resposta}</p>
                  ) : (
                    /* Typing indicator */
                    <div className="flex items-center gap-1.5 py-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100 transition-all">
            <textarea
              value={pergunta}
              onChange={e => setPergunta(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte algo sobre o documento…"
              rows={1}
              disabled={consultando}
              className="w-full text-sm text-gray-800 bg-transparent resize-none focus:outline-none placeholder-gray-400 disabled:opacity-50"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
            />
          </div>
          <button
            type="submit"
            disabled={!pergunta.trim() || consultando}
            className="w-10 h-10 bg-green-500 text-white rounded-2xl flex items-center justify-center flex-shrink-0 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95">
            {consultando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-1.5 text-center">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  )
}

// ─── ChecklistCard ────────────────────────────────────────────────────────────

function ChecklistCard({ checklist, onClick }: { checklist: Checklist; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-4 flex items-center gap-3 hover:border-orange-300 hover:shadow-sm active:scale-[0.99] transition-all">
      <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
        <CheckSquare size={18} className="text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm leading-snug truncate">{checklist.nome}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {checklist.total_atividades} {checklist.total_atividades === 1 ? 'atividade' : 'atividades'}
        </p>
      </div>
      <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
    </button>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function OperacaoPage() {
  const { unidadeAtiva, empresaAtiva, faseAssinatura, flagsHabilitadas } = useSession()
  const iaHabilitada = flagsHabilitadas === null || flagsHabilitadas.has('ia')
  const router = useRouter()
  const online = useOnlineStatus()
  const [aba, setAba] = useState<Aba>('checklists')
  const [ticketModalOpen, setTicketModalOpen] = useState(false)
  const [grupos, setGrupos] = useState<GrupoAgrupado[]>([])
  const [semGrupo, setSemGrupo] = useState<Checklist[]>([])
  const [itensWorkflow, setItensWorkflow] = useState<ItemWorkflowLiberado[]>([])
  const [agendadas, setAgendadas] = useState<ExecucaoAgendada[]>([])
  const [naoFinalizadas, setNaoFinalizadas] = useState<ExecucaoNaoFinalizada[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  // Disponibilidade de cada aba — abas sem item são suprimidas do menu
  const [temTarefas, setTemTarefas] = useState(false)
  const [temTickets, setTemTickets] = useState(false)
  const [temDocumentos, setTemDocumentos] = useState(false)
  const [temHistorico, setTemHistorico] = useState(false)
  const [abasProntas, setAbasProntas] = useState(false)  // disponibilidade das abas já carregada?

  useEffect(() => {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    carregarChecklists()
  }, [unidadeAtiva?.id])

  // Calcula se Tarefas/Documentos/Histórico têm itens (p/ suprimir abas vazias)
  useEffect(() => {
    if (!unidadeAtiva?.id) return
    let cancel = false
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const isAdmin = await ehAdminDaEmpresa(sb, empresaAtiva?.id)
      const [{ data: ug }, { data: us }] = await Promise.all([
        sb.from('usuario_grupo').select('grupo_id').eq('usuario_id', user.id),
        sb.from('usuario_subgrupo').select('subgrupo_id').eq('usuario_id', user.id),
      ])
      const meusGrupos = new Set((ug ?? []).map((r: any) => r.grupo_id))
      const meusSubgrupos = new Set((us ?? []).map((r: any) => r.subgrupo_id))

      // Tarefas (mesma regra do AbaTarefas)
      const { data: listas } = await sb.from('tarefa_listas')
        .select('id, liberacao_em, abertura_data_limite, abertura_max_respostas, grupos:tarefa_lista_grupos(grupo_id), subgrupos:tarefa_lista_subgrupos(subgrupo_id), respostas:tarefa_execucoes(id)')
        .eq('unidade_id', unidadeAtiva!.id).eq('status', 'publicada')
      const agora = Date.now()
      const temTar = (listas ?? []).some((l: any) => listaDisponivel({
        liberacao_em: l.liberacao_em,
        abertura_data_limite: l.abertura_data_limite, abertura_max_respostas: l.abertura_max_respostas,
        total_respostas: (l.respostas ?? []).length,
        grupos: (l.grupos ?? []).map((g: any) => g.grupo_id),
        subgrupos: (l.subgrupos ?? []).map((s: any) => s.subgrupo_id),
      }, agora, meusGrupos, meusSubgrupos, isAdmin))

      // Documentos (visível por subgrupo/grupo/geral; admin vê todos).
      // Consulta Inteligente sem arquivo não conta (não aparece na Operação).
      const { data: docs } = await sb.from('documentos')
        .select('id, tipo, arquivo_url, subgrupo_id, grupo_id').eq('unidade_id', unidadeAtiva!.id)
      const temDoc = (docs ?? [])
        .filter((d: any) => !(d.tipo === 'consulta_inteligente' && (!d.arquivo_url || !iaHabilitada)))
        .some((d: any) => documentoVisivelOperador(d, { isAdmin, meusGrupos, meusSubgrupos }))

      // Histórico (execuções do próprio usuário nesta unidade)
      const { count } = await sb.from('checklist_execucoes')
        .select('id', { count: 'exact', head: true })
        .eq('unidade_id', unidadeAtiva!.id).eq('executado_por', user.id)

      // Tickets (o RLS já restringe às linhas visíveis ao usuário)
      const { count: countTickets } = await sb.from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('unidade_id', unidadeAtiva!.id)

      if (cancel) return
      setTemTarefas(temTar)
      setTemTickets((countTickets ?? 0) > 0)
      setTemDocumentos(temDoc)
      setTemHistorico((count ?? 0) > 0)
      setAbasProntas(true)
    })()
    return () => { cancel = true }
  }, [unidadeAtiva?.id, empresaAtiva?.id, iaHabilitada])

  // Restaura a aba a partir da URL (?aba=...) no mount — mantém a aba ao dar
  // refresh e ao voltar de uma tela de detalhe (ex.: execução aberta do Histórico).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('aba') as Aba | null
    if (p && p !== aba) setAba(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Espelha a aba ativa na URL (sem recarregar) — o "voltar" do navegador cai
  // de volta nesta aba, e o refresh a preserva.
  useEffect(() => {
    const url = aba === 'checklists' ? '/operacao' : `/operacao?aba=${aba}`
    window.history.replaceState(null, '', url)
  }, [aba])

  // Se a aba ativa ficou indisponível (sem itens), pula p/ a primeira disponível.
  // ⚠️ Só age quando a disponibilidade JÁ carregou (checklists + demais abas):
  // antes disso, tem* começam `false` e trocariam a aba lida da URL (?aba=...)
  // de volta pro Checklists — o bug de "não preserva a aba".
  useEffect(() => {
    if (loading || !abasProntas) return
    const disp: Record<Aba, boolean> = {
      checklists: grupos.length > 0 || semGrupo.length > 0 || agendadas.length > 0
        || itensWorkflow.length > 0 || naoFinalizadas.length > 0,
      tarefas: temTarefas, tickets: temTickets, historico: temHistorico, documentos: temDocumentos,
    }
    if (!disp[aba]) {
      const primeira = (['checklists', 'historico', 'tarefas', 'tickets', 'documentos'] as Aba[]).find(id => disp[id])
      if (primeira) setAba(primeira)
    }
  }, [loading, abasProntas, grupos, semGrupo, agendadas, itensWorkflow, naoFinalizadas, temTarefas, temTickets, temHistorico, temDocumentos, aba])

  async function carregarChecklists() {
    setLoading(true)

    // OFFLINE: monta a lista a partir do cache local — só os checklists marcados
    // como "disponível offline". Seções que dependem de rede (workflows,
    // agendadas, não finalizadas) ficam vazias.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offline = carregarListaOffline<Checklist>(unidadeAtiva!.id)
      const { grupos: gOff, semGrupo: sgOff } = agruparChecklists(offline)
      setGrupos(gOff)
      setSemGrupo(sgOff)
      setItensWorkflow([])
      setAgendadas([])
      setNaoFinalizadas([])
      setLoading(false)
      return
    }

    const sb = createClient()

    // Visibilidade por subgrupo: o operador vê só os checklists dos subgrupos
    // a que pertence (+ os sem subgrupo = gerais da unidade). Admin vê todos.
    const { data: { user: authUser } } = await sb.auth.getUser()
    const isAdmin = await ehAdminDaEmpresa(sb, empresaAtiva?.id)
    let meusSubgrupos = new Set<string>()
    if (authUser && !isAdmin) {
      const { data: us } = await sb.from('usuario_subgrupo').select('subgrupo_id').eq('usuario_id', authUser.id)
      meusSubgrupos = new Set((us ?? []).map((r: any) => r.subgrupo_id))
    }

    // Itens de workflow LIBERADOS visíveis ao operador (admin vê todos; senão só
    // os dos seus subgrupos). Também usados para esconder da lista avulsa os
    // checklists que devem ser executados PELO fluxo do workflow (evita a "porta
    // dupla": executar solto não vincula nem avança o workflow).
    const checklistsEmWorkflow = new Set<string>()
    if (WORKFLOWS_HABILITADO) {
      const { data: wfItemsRaw } = await sb.from('workflow_item_execucoes').select(`
        id, estagio_item_id,
        workflow_execucao:workflow_execucao_id(id, unidade_id, workflow:workflow_id(nome)),
        item:estagio_item_id(checklist_id, subgrupo_id, checklist:checklist_id(nome), subgrupo:subgrupo_id(nome), estagio:estagio_id(nome))
      `).eq('status', 'liberado')

      const liberados: ItemWorkflowLiberado[] = []
      for (const wie of (wfItemsRaw ?? [])) {
        const exec = Array.isArray(wie.workflow_execucao) ? wie.workflow_execucao[0] : wie.workflow_execucao
        if (!exec || exec.unidade_id !== unidadeAtiva!.id) continue
        const item = Array.isArray(wie.item) ? wie.item[0] : wie.item
        if (!item) continue
        // Cada setor só vê a SUA etapa (admin vê todas)
        if (!visivelPorSubgrupo(item.subgrupo_id, { isAdmin, meusSubgrupos })) continue
        const wf = Array.isArray(exec.workflow) ? exec.workflow[0] : exec.workflow
        const cl = Array.isArray(item.checklist) ? item.checklist[0] : item.checklist
        const sg = Array.isArray(item.subgrupo) ? item.subgrupo[0] : item.subgrupo
        const est = Array.isArray(item.estagio) ? item.estagio[0] : item.estagio
        liberados.push({ item_execucao_id: wie.id, checklist_id: item.checklist_id,
          checklist_nome: cl?.nome ?? '—', workflow_nome: wf?.nome ?? '—',
          estagio_nome: est?.nome ?? '—', subgrupo_nome: sg?.nome ?? null })
        checklistsEmWorkflow.add(item.checklist_id)
      }
      setItensWorkflow(liberados)
    } else {
      setItensWorkflow([])
    }

    const { data } = await sb
      .from('checklists')
      .select(`id, nome, descricao, subgrupo_id, subgrupo:subgrupo_id(id, nome, grupo:grupo_id(id, nome))`)
      .eq('unidade_id', unidadeAtiva!.id)
      .eq('status', 'publicado')
      .order('nome')

    if (data) {
      const ids = data.map((c: any) => c.id)
      const { data: counts } = ids.length
        ? await sb.from('checklist_atividades').select('checklist_id').in('checklist_id', ids).is('atividade_pai_id', null)
        : { data: [] }

      const countMap: Record<string, number> = {}
      for (const row of (counts ?? [])) countMap[row.checklist_id] = (countMap[row.checklist_id] ?? 0) + 1

      const comContagem: Checklist[] = data.map((c: any) => {
        const sub = Array.isArray(c.subgrupo) ? c.subgrupo[0] : c.subgrupo
        const grp = sub ? (Array.isArray(sub.grupo) ? sub.grupo[0] : sub.grupo) : null
        return { id: c.id, nome: c.nome, descricao: c.descricao, total_atividades: countMap[c.id] ?? 0,
          subgrupo_id: sub?.id ?? null, subgrupo_nome: sub?.nome ?? null, grupo_id: grp?.id ?? null, grupo_nome: grp?.nome ?? null }
      })

      // Filtra por subgrupo do usuário (admin vê todos; checklist sempre tem
      // subgrupo) E esconde os que estão liberados via workflow — esses devem
      // ser executados pelo card "Workflows em andamento", não avulso.
      const visiveis = comContagem.filter(cl =>
        checklistVisivelOperador(cl, { isAdmin, meusSubgrupos }, checklistsEmWorkflow))

      const { grupos: gruposArr, semGrupo: semGrupoArr } = agruparChecklists(visiveis)
      setGrupos(gruposArr)
      setSemGrupo(semGrupoArr)

      // Prepara o uso offline: cacheia a lista dos checklists marcados como
      // "disponível offline" e pré-baixa suas definições em background. Best-effort
      // — se a coluna permite_offline ainda não existir, segue sem cachear.
      try {
        const { data: offFlags } = await sb.from('checklists').select('id, permite_offline').in('id', ids)
        const offIds = new Set((offFlags ?? []).filter((r: any) => r.permite_offline).map((r: any) => r.id))
        const offlineVisiveis = visiveis.filter(c => offIds.has(c.id))
        salvarListaOffline(unidadeAtiva!.id, offlineVisiveis)
        for (const c of offlineVisiveis) {
          buscarDefinicaoChecklist(sb, c.id, unidadeAtiva!.id)
            .then(snap => {
              if (!snap) return
              salvarChecklistCache(chaveChecklist(c.id, unidadeAtiva!.id), snap)
              // Pré-cacheia os catálogos das atividades tipo "catalogo"
              const catIds = [...new Set(
                (snap.atvsData as any[])
                  .filter(a => a.tipo === 'catalogo' && a.config?.catalogo_id)
                  .map(a => a.config.catalogo_id as string)
              )]
              for (const catId of catIds) {
                buscarCatalogo(sb, catId)
                  .then(cs => { if (cs) salvarCatalogoCache(catId, cs) })
                  .catch(() => {})
              }
            })
            .catch(() => {})
        }
        // Pré-carrega as ROTAS de execução num iframe oculto (navegação real →
        // o service worker cacheia HTML + todos os chunks JS). É o que faz a
        // página abrir offline de verdade (prefetch sozinho não basta no App Router).
        preCarregarRotasOffline(offlineVisiveis.map(c => `/operacao/${c.id}`))
      } catch { /* coluna ainda não migrada: ignora */ }
    }

    // (itens de workflow liberados já carregados acima, antes da listagem)

    // Execuções agendadas pendentes da unidade (criadas por agendamentos_processar,
    // executado_por nulo = ainda sem operador). Só os operadores do subgrupo do
    // checklist veem/assumem (admin vê todas) — mesma regra dos checklists avulsos.
    const { data: pendAgendadas } = await sb
      .from('checklist_execucoes')
      .select('id, data_execucao, checklist_id, checklists(nome, subgrupo_id)')
      .eq('unidade_id', unidadeAtiva!.id)
      .eq('status', 'em_andamento')
      .is('executado_por', null)
      .not('agendamento_id', 'is', null)
      .order('data_execucao', { ascending: true })

    setAgendadas((pendAgendadas ?? [])
      .map((e: any) => {
        const cl = Array.isArray(e.checklists) ? e.checklists[0] : e.checklists
        return {
          execucao_id: e.id,
          checklist_id: e.checklist_id,
          checklist_nome: cl?.nome ?? '—',
          subgrupo_id: cl?.subgrupo_id ?? null,
          criado_em: e.data_execucao,
        }
      })
      .filter((e: any) => visivelPorSubgrupo(e.subgrupo_id, { isAdmin, meusSubgrupos }))
      .map(({ subgrupo_id, ...e }: any) => e))

    // Execuções que ESTE operador iniciou/assumiu e não finalizou (em_andamento).
    // Ficam como pendência incômoda até serem concluídas ou descartadas.
    // Exclui as de workflow (têm fluxo próprio na seção "Workflows em andamento").
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const { data: emAberto } = await sb
        .from('checklist_execucoes')
        .select('id, data_execucao, checklist_id, checklists(nome)')
        .eq('unidade_id', unidadeAtiva!.id)
        .eq('status', 'em_andamento')
        .eq('executado_por', user.id)
        .order('data_execucao', { ascending: true })

      const ids = (emAberto ?? []).map((e: any) => e.id)
      let idsWorkflow = new Set<string>()
      if (ids.length > 0) {
        const { data: wf } = await sb.from('workflow_item_execucoes')
          .select('checklist_execucao_id').in('checklist_execucao_id', ids)
        idsWorkflow = new Set((wf ?? []).map((w: any) => w.checklist_execucao_id))
      }

      setNaoFinalizadas((emAberto ?? [])
        .filter((e: any) => !idsWorkflow.has(e.id))
        .map((e: any) => ({
          execucao_id: e.id,
          checklist_id: e.checklist_id,
          checklist_nome: (Array.isArray(e.checklists) ? e.checklists[0] : e.checklists)?.nome ?? '—',
          iniciado_em: e.data_execucao,
        })))
    }

    setLoading(false)
  }

  if (!unidadeAtiva) return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center">
        <AlertCircle size={48} className="text-amber-300 mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Nenhuma unidade selecionada</p>
        <p className="text-sm text-gray-400 mt-1">Entre em contato com o administrador.</p>
      </div>
    </div>
  )

  const temChecklists = grupos.length > 0 || semGrupo.length > 0 || agendadas.length > 0
    || itensWorkflow.length > 0 || naoFinalizadas.length > 0
  const dispMap: Record<Aba, boolean> = {
    checklists: temChecklists, tarefas: temTarefas, tickets: temTickets, historico: temHistorico, documentos: temDocumentos,
  }
  const ABAS = ([
    { id: 'checklists', label: 'Checklists',  icon: <CheckSquare size={15} /> },
    { id: 'historico',  label: 'Histórico',   icon: <History size={15} /> },
    { id: 'tarefas',    label: 'Tarefas',     icon: <ListChecks size={15} /> },
    { id: 'tickets',    label: 'Tickets',     icon: <Ticket size={15} /> },
    { id: 'documentos', label: 'Documentos',  icon: <FileText size={15} /> },
  ] as { id: Aba; label: string; icon: React.ReactNode }[]).filter(a => dispMap[a.id])

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-16">
      <Onboarding pageId="operacao" titulo="Operação" cards={ONBOARDING_OPERACAO} visualizacaoUnica />
      {/* Aviso de sem conexão — offline a lista mostra só os checklists disponíveis offline */}
      {!online && (
        <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700 font-medium">Sem conexão — exibindo só os checklists disponíveis offline.</p>
        </div>
      )}
      {/* Abas */}
      <div className="sticky top-14 z-20 bg-gray-50 pt-4 pb-3">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          {ABAS.map(a => {
            const ativa = aba === a.id
            return (
              <button key={a.id} onClick={() => setAba(a.id)}
                title={a.label} aria-label={a.label}
                className={`flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-all ${
                  // Mobile: ativa cresce com o texto, inativas só ícone (compacto).
                  // Desktop (sm+): todas iguais com texto.
                  ativa ? 'flex-1' : 'flex-none px-3 sm:flex-1 sm:px-0'
                } ${
                  ativa
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                {a.icon}
                <span className={ativa ? '' : 'hidden sm:inline'}>{a.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {loading && aba === 'checklists' ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {aba === 'checklists' && (
            <AbaChecklists grupos={grupos} semGrupo={semGrupo}
              itensWorkflow={itensWorkflow} agendadas={agendadas}
              naoFinalizadas={naoFinalizadas}
              onNaoExecutado={() => carregarChecklists()}
              busca={busca} setBusca={setBusca} />
          )}
          {aba === 'tarefas' && <AbaTarefas unidadeId={unidadeAtiva.id} empresaId={empresaAtiva?.id} />}
          {aba === 'tickets' && <AbaTickets unidadeId={unidadeAtiva.id} empresaId={empresaAtiva?.id} />}
          {aba === 'historico' && <AbaHistorico unidadeId={unidadeAtiva.id} />}
          {aba === 'documentos' && <AbaDocumentos unidadeId={unidadeAtiva.id} empresaId={empresaAtiva?.id} />}
        </>
      )}

      {/* FAB — Abrir Ticket avulso (oculto na carência: criação bloqueada) */}
      {faseAssinatura === 'ativa' && (
        <button
          onClick={() => setTicketModalOpen(true)}
          className="fixed bottom-6 right-4 z-40 flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-3.5 py-2.5 rounded-full shadow-lg hover:shadow-xl hover:bg-gray-50 transition-all active:scale-95">
          <Ticket size={15} className="text-blue-600" /> Abrir Ticket
        </button>
      )}

      <NovoTicketModal
        open={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
      />
    </div>
  )
}
