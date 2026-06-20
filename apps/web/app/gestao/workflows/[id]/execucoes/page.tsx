'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Loader2, AlertCircle, CheckCircle2, XCircle,
  Clock, Play, PauseCircle, StopCircle, RefreshCw, Layers,
  GitBranch, ChevronRight
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { WORKFLOWS_HABILITADO } from '@/lib/features'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ItemExec {
  id:                    string
  estagio_item_id:       string
  checklist_execucao_id: string | null
  status:                'bloqueado' | 'liberado' | 'em_andamento' | 'aprovado' | 'reprovado' | 'pulado'
  liberado_em:           string | null
  iniciado_em:           string | null
  concluido_em:          string | null
  checklist_nome:        string
  subgrupo_nome:         string | null
  obrigatorio:           boolean
}

interface EstagioExec {
  id:     string
  nome:   string
  ordem:  number
  condicao_avanco: string
  itens:  ItemExec[]
}

interface ExecucaoDetalhe {
  id:                  string
  workflow_id:         string
  workflow_nome:       string
  status:              'em_andamento' | 'concluido' | 'bloqueado' | 'cancelado'
  estagio_atual_ordem: number
  iniciado_em:         string
  concluido_em:        string | null
  estagios:            EstagioExec[]
}

// ─── Helpers de status ────────────────────────────────────────────────────────

const ITEM_STATUS: Record<string, { label: string; cor: string; Icon: any }> = {
  bloqueado:   { label: 'Bloqueado',    cor: 'bg-gray-100 text-gray-400',    Icon: PauseCircle },
  liberado:    { label: 'Aguardando',   cor: 'bg-blue-100 text-blue-600',    Icon: Clock },
  em_andamento:{ label: 'Em andamento', cor: 'bg-amber-100 text-amber-600',  Icon: Play },
  aprovado:    { label: 'Aprovado',     cor: 'bg-green-100 text-green-600',  Icon: CheckCircle2 },
  reprovado:   { label: 'Reprovado',    cor: 'bg-red-100 text-red-600',      Icon: XCircle },
  pulado:      { label: 'Pulado',       cor: 'bg-purple-100 text-purple-500',Icon: StopCircle },
}

const EXEC_STATUS: Record<string, { label: string; cor: string }> = {
  em_andamento: { label: 'Em andamento', cor: 'bg-amber-100 text-amber-700' },
  concluido:    { label: 'Concluído',    cor: 'bg-green-100 text-green-700' },
  bloqueado:    { label: 'Bloqueado',    cor: 'bg-red-100 text-red-700' },
  cancelado:    { label: 'Cancelado',    cor: 'bg-gray-100 text-gray-500' },
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Página de listagem de execuções ─────────────────────────────────────────

interface ExecucaoRow {
  id: string
  status: 'em_andamento' | 'concluido' | 'bloqueado' | 'cancelado'
  estagio_atual_ordem: number
  iniciado_em: string
  concluido_em: string | null
  iniciado_por_nome: string | null
  total_estagios: number
}

export default function WorkflowExecucoesPage(props: { params: Promise<{ id: string }> }) {
  if (!WORKFLOWS_HABILITADO) return (
    <div className="py-20 text-center">
      <GitBranch size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Workflows temporariamente indisponível</p>
      <p className="text-xs text-gray-400 mt-1">Esta funcionalidade está em revisão.</p>
    </div>
  )
  return <WorkflowExecucoesInner {...props} />
}

function WorkflowExecucoesInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { unidadeAtiva } = useSession()

  const [execucoes, setExecucoes]       = useState<ExecucaoRow[]>([])
  const [selecionada, setSelecionada]   = useState<ExecucaoDetalhe | null>(null)
  const [loading, setLoading]           = useState(true)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [nomeWorkflow, setNomeWorkflow] = useState('')
  const [totalEstagios, setTotalEstagios] = useState(0)

  const carregar = useCallback(async () => {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const sb = createClient()

    const { data: wf } = await sb.from('workflows').select('nome').eq('id', id).single()
    setNomeWorkflow(wf?.nome ?? 'Workflow')

    const { data: ests } = await sb.from('workflow_estagios')
      .select('id').eq('workflow_id', id)
    setTotalEstagios(ests?.length ?? 0)

    const { data: execs } = await sb.from('workflow_execucoes')
      .select('id, status, estagio_atual_ordem, iniciado_em, concluido_em, iniciado_por:iniciado_por(nome_completo)')
      .eq('workflow_id', id)
      .eq('unidade_id', unidadeAtiva.id)
      .order('iniciado_em', { ascending: false })

    setExecucoes((execs ?? []).map((e: any) => ({
      id: e.id,
      status: e.status,
      estagio_atual_ordem: e.estagio_atual_ordem,
      iniciado_em: e.iniciado_em,
      concluido_em: e.concluido_em,
      iniciado_por_nome: e.iniciado_por?.nome_completo ?? null,
      total_estagios: ests?.length ?? 0,
    })))
    setLoading(false)
  }, [id, unidadeAtiva?.id])

  useEffect(() => { carregar() }, [carregar])

  async function abrirDetalhe(execId: string) {
    setLoadingDetalhe(true)
    const sb = createClient()

    const { data: exec } = await sb.from('workflow_execucoes')
      .select('id, workflow_id, status, estagio_atual_ordem, iniciado_em, concluido_em')
      .eq('id', execId).single()

    const { data: estagios } = await sb.from('workflow_estagios')
      .select('id, nome, ordem, condicao_avanco')
      .eq('workflow_id', exec!.workflow_id)
      .order('ordem')

    const { data: itemExecs } = await sb.from('workflow_item_execucoes')
      .select(`
        id, estagio_item_id, checklist_execucao_id, status,
        liberado_em, iniciado_em, concluido_em,
        item:estagio_item_id(obrigatorio, subgrupo_id(nome), checklist_id(nome))
      `)
      .eq('workflow_execucao_id', execId)

    const itensMap: Record<string, ItemExec[]> = {}
    for (const ie of (itemExecs ?? [])) {
      const item = Array.isArray(ie.item) ? ie.item[0] : ie.item
      const cl = item?.checklist_id
      const sg = item?.subgrupo_id
      const estId = (estagios ?? []).find(e =>
        (ie.estagio_item_id as string).startsWith(e.id.slice(0, 8))
      )

      // Busca o estagio correto pelo join
      const { data: wsi } = await sb.from('workflow_estagio_itens')
        .select('estagio_id').eq('id', ie.estagio_item_id).single()

      const key = wsi?.estagio_id
      if (!key) continue
      if (!itensMap[key]) itensMap[key] = []
      itensMap[key].push({
        id: ie.id,
        estagio_item_id: ie.estagio_item_id,
        checklist_execucao_id: ie.checklist_execucao_id,
        status: ie.status,
        liberado_em: ie.liberado_em,
        iniciado_em: ie.iniciado_em,
        concluido_em: ie.concluido_em,
        checklist_nome: (Array.isArray(cl) ? cl[0] : cl)?.nome ?? '—',
        subgrupo_nome: (Array.isArray(sg) ? sg[0] : sg)?.nome ?? null,
        obrigatorio: item?.obrigatorio ?? true,
      })
    }

    setSelecionada({
      id: exec!.id,
      workflow_id: exec!.workflow_id,
      workflow_nome: nomeWorkflow,
      status: exec!.status,
      estagio_atual_ordem: exec!.estagio_atual_ordem,
      iniciado_em: exec!.iniciado_em,
      concluido_em: exec!.concluido_em,
      estagios: (estagios ?? []).map(e => ({
        ...e,
        itens: itensMap[e.id] ?? [],
      })),
    })
    setLoadingDetalhe(false)
  }

  // ─── Detalhe da execução ───────────────────────────────────────────────────

  if (selecionada) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSelecionada(null)}
            className="p-1.5 text-gray-400 hover:text-violet-500 rounded-lg hover:bg-violet-50 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-800">{nomeWorkflow}</h1>
            <p className="text-xs text-gray-400">
              Iniciado em {formatDate(selecionada.iniciado_em)}
              {selecionada.concluido_em && ` · Concluído em ${formatDate(selecionada.concluido_em)}`}
            </p>
          </div>
          <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full ${EXEC_STATUS[selecionada.status].cor}`}>
            {EXEC_STATUS[selecionada.status].label}
          </span>
        </div>

        <div className="space-y-1">
          {selecionada.estagios.map((est, idx) => {
            const ativo = est.ordem === selecionada.estagio_atual_ordem
            const passado = est.ordem < selecionada.estagio_atual_ordem
            return (
              <div key={est.id}>
                <div className={`border rounded-2xl overflow-hidden ${ativo ? 'border-violet-300 shadow-sm' : passado ? 'border-green-200' : 'border-gray-200 opacity-60'}`}>
                  <div className={`px-4 py-3 flex items-center gap-3 ${ativo ? 'bg-violet-50' : passado ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${ativo ? 'bg-violet-200 text-violet-700' : passado ? 'bg-green-200 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                      {idx + 1}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 flex-1">{est.nome}</span>
                    {ativo && <span className="text-xs text-violet-600 font-medium">Estágio atual</span>}
                    {passado && <CheckCircle2 size={15} className="text-green-500" />}
                  </div>

                  <div className="px-4 py-3 space-y-2">
                    {est.itens.length === 0 ? (
                      <p className="text-xs text-gray-400">Sem itens registrados.</p>
                    ) : est.itens.map(item => {
                      const cfg = ITEM_STATUS[item.status]
                      return (
                        <div key={item.id} className="flex items-center gap-3">
                          <cfg.Icon size={14} className={cfg.cor.split(' ')[1]} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{item.checklist_nome}</p>
                            {item.subgrupo_nome && (
                              <p className="text-xs text-gray-400">{item.subgrupo_nome}</p>
                            )}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cor}`}>
                            {cfg.label}
                          </span>
                          {item.concluido_em && (
                            <span className="text-xs text-gray-400">{formatDate(item.concluido_em)}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {idx < selecionada.estagios.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ChevronRight size={16} className="text-gray-300 rotate-90" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Listagem de execuções ─────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/gestao/workflows')}
          className="p-1.5 text-gray-400 hover:text-violet-500 rounded-lg hover:bg-violet-50 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-800">{nomeWorkflow}</h1>
          <p className="text-xs text-gray-400">Execuções registradas</p>
        </div>
        <button onClick={carregar} className="ml-auto p-1.5 text-gray-400 hover:text-violet-500 rounded-lg hover:bg-violet-50 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 size={24} className="animate-spin text-violet-400" />
        </div>
      ) : execucoes.length === 0 ? (
        <div className="py-20 text-center">
          <GitBranch size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma execução iniciada.</p>
          <p className="text-xs text-gray-400 mt-1">Inicie uma execução na página de Workflows.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {execucoes.map(e => {
            const cfg = EXEC_STATUS[e.status]
            return (
              <button key={e.id} onClick={() => abrirDetalhe(e.id)} disabled={loadingDetalhe}
                className="w-full flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors text-left">
                <div className="w-8 h-8 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Layers size={15} className="text-violet-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    Execução de {formatDate(e.iniciado_em)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      Estágio {e.estagio_atual_ordem} de {totalEstagios}
                    </span>
                    {e.iniciado_por_nome && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{e.iniciado_por_nome}</span>
                      </>
                    )}
                  </div>
                </div>

                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.cor}`}>
                  {cfg.label}
                </span>

                {loadingDetalhe
                  ? <Loader2 size={14} className="text-gray-300 animate-spin" />
                  : <ChevronRight size={15} className="text-gray-300" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
