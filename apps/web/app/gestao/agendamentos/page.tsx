'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Clock, GitBranch, CheckSquare, Trash2, Power, PowerOff,
  Loader2, AlertCircle, X, ChevronDown, Check, Calendar, Pencil
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Button } from '@/components/ui/Button'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useToast, useConfirm } from '@/components/ui/feedback'
import { WORKFLOWS_HABILITADO } from '@/lib/features'
import { agendamentoVisivelGestor } from '@/lib/visibilidade'
import { ehAdminDaEmpresa } from '@/lib/admin'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Agendamento {
  id: string
  tipo_alvo: 'workflow' | 'checklist'
  workflow_id: string | null
  checklist_id: string | null
  alvo_nome: string
  intervalo_unidade: 'horas' | 'dias' | 'meses'
  intervalo_valor: number
  referencia_inicio: string
  proxima_execucao: string
  ultima_execucao_em: string | null
  ativo: boolean
}

interface Opcao { id: string; nome: string }

const UNIDADE_LABEL: Record<string, (v: number) => string> = {
  horas: v => v === 1 ? 'hora' : 'horas',
  dias:  v => v === 1 ? 'dia'  : 'dias',
  meses: v => v === 1 ? 'mês'  : 'meses',
}

function formatarData(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Modal de criação ─────────────────────────────────────────────────────────

function isoParaLocal(iso: string): { data: string; hora: string } {
  const d = new Date(iso)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
  return { data: local.slice(0, 10), hora: local.slice(11, 16) }
}

function NovoAgendamentoModal({
  empresaId,
  unidadeId,
  agendamento,
  onClose,
  onCriado,
}: {
  empresaId: string
  unidadeId: string
  agendamento?: Agendamento | null
  onClose: () => void
  onCriado: () => void
}) {
  const isEdicao = !!agendamento
  const refLocal = agendamento ? isoParaLocal(agendamento.referencia_inicio) : null
  const [tipoAlvo, setTipoAlvo]       = useState<'workflow' | 'checklist'>(agendamento?.tipo_alvo ?? (WORKFLOWS_HABILITADO ? 'workflow' : 'checklist'))
  const [workflows, setWorkflows]     = useState<Opcao[]>([])
  const [checklists, setChecklists]   = useState<Opcao[]>([])
  const [alvoId, setAlvoId]           = useState(agendamento ? (agendamento.tipo_alvo === 'workflow' ? agendamento.workflow_id : agendamento.checklist_id) ?? '' : '')
  const [intervaloUnidade, setIntervaloUnidade] = useState<'horas' | 'dias' | 'meses'>(agendamento?.intervalo_unidade ?? 'dias')
  const [intervaloValor, setIntervaloValor]     = useState(agendamento ? String(agendamento.intervalo_valor) : '1')
  const [dataRef, setDataRef]         = useState(refLocal?.data ?? '')
  const [horaRef, setHoraRef]         = useState(refLocal?.hora ?? '08:00')
  const [salvando, setSalvando]       = useState(false)
  const [erro, setErro]               = useState('')
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('workflows').select('id, nome').eq('empresa_id', empresaId).eq('status', 'publicado').order('nome'),
      sb.from('checklists').select('id, nome').eq('unidade_id', unidadeId).eq('status', 'publicado').order('nome'),
    ]).then(([wfRes, clRes]) => {
      setWorkflows(wfRes.data ?? [])
      setChecklists(clRes.data ?? [])
      setLoading(false)
    })
  }, [empresaId, unidadeId])

  const opcoesAlvo = tipoAlvo === 'workflow' ? workflows : checklists

  async function salvar() {
    setErro('')
    if (!alvoId) { setErro(`Selecione um ${tipoAlvo === 'workflow' ? 'workflow' : 'checklist'}.`); return }
    const valor = Number(intervaloValor)
    if (!Number.isInteger(valor) || valor <= 0) { setErro('Informe um intervalo válido (número inteiro maior que zero).'); return }
    if (!dataRef || !horaRef) { setErro('Informe a data e hora de referência para o início.'); return }

    const referencia = new Date(`${dataRef}T${horaRef}:00`)
    if (isNaN(referencia.getTime())) { setErro('Data/hora de referência inválida.'); return }

    setSalvando(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()

    const payload: any = {
      tipo_alvo: tipoAlvo,
      workflow_id: tipoAlvo === 'workflow' ? alvoId : null,
      checklist_id: tipoAlvo === 'checklist' ? alvoId : null,
      intervalo_unidade: intervaloUnidade,
      intervalo_valor: valor,
      referencia_inicio: referencia.toISOString(),
    }

    const { error } = isEdicao
      ? await sb.from('agendamentos').update(payload).eq('id', agendamento!.id)
      : await sb.from('agendamentos').insert({ ...payload, empresa_id: empresaId, unidade_id: unidadeId, criado_por: user?.id })
    setSalvando(false)
    if (error) { setErro('Erro ao salvar agendamento. Tente novamente.'); return }
    onCriado()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-800">{isEdicao ? 'Editar agendamento' : 'Novo agendamento'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 overflow-y-auto">
          {/* Tipo de alvo — só aparece se Workflows estiver habilitado */}
          {WORKFLOWS_HABILITADO && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">O que deseja agendar?</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setTipoAlvo('workflow'); setAlvoId('') }}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${tipoAlvo === 'workflow' ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <GitBranch size={15} /> Workflow
              </button>
              <button onClick={() => { setTipoAlvo('checklist'); setAlvoId('') }}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${tipoAlvo === 'checklist' ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <CheckSquare size={15} /> Checklist
              </button>
            </div>
          </div>
          )}

          {/* Seleção do alvo */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {tipoAlvo === 'workflow' ? 'Workflow' : 'Checklist'}
            </label>
            <div className="relative">
              <select value={alvoId} onChange={e => setAlvoId(e.target.value)} disabled={loading}
                className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white pr-8 disabled:opacity-50">
                <option value="">{loading ? 'Carregando...' : `Selecione um ${tipoAlvo === 'workflow' ? 'workflow publicado' : 'checklist publicado'}`}</option>
                {opcoesAlvo.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {!loading && opcoesAlvo.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Nenhum {tipoAlvo === 'workflow' ? 'workflow publicado' : 'checklist publicado'} encontrado nesta unidade.
              </p>
            )}
          </div>

          {/* Recorrência */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Repetir a cada</label>
            <div className="flex items-center gap-2">
              <input type="number" min={1} value={intervaloValor} onChange={e => setIntervaloValor(e.target.value)}
                className="w-20 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 text-center" />
              <div className="relative flex-1">
                <select value={intervaloUnidade} onChange={e => setIntervaloUnidade(e.target.value as any)}
                  className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white pr-8">
                  <option value="horas">Hora(s)</option>
                  <option value="dias">Dia(s)</option>
                  <option value="meses">Mês(es)</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Ex.: a cada 6 horas, a cada 3 dias, a cada 1 mês.
            </p>
          </div>

          {/* Data/hora de referência */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Data e hora de referência (1º disparo)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200" />
              </div>
              <input type="time" value={horaRef} onChange={e => setHoraRef(e.target.value)}
                className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Todas as próximas execuções são calculadas a partir deste ponto, somando o intervalo escolhido.
            </p>
          </div>

          {erro && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600">{erro}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors disabled:opacity-50">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isEdicao ? 'Salvar' : 'Criar agendamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AgendamentosPage() {
  const { empresaAtiva, unidadeAtiva } = useSession()
  const toast = useToast()
  const confirm = useConfirm()
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading]           = useState(true)
  const [modalAberto, setModalAberto]   = useState(false)
  const [editando, setEditando]         = useState<Agendamento | null>(null)
  const [alterando, setAlterando]       = useState<string | null>(null)

  useEffect(() => { carregar() }, [empresaAtiva?.id, unidadeAtiva?.id])

  async function carregar() {
    if (!empresaAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    const isAdmin = await ehAdminDaEmpresa(sb, empresaAtiva?.id)

    let q = sb.from('agendamentos')
      .select('id, tipo_alvo, workflow_id, checklist_id, intervalo_unidade, intervalo_valor, referencia_inicio, proxima_execucao, ultima_execucao_em, ativo, workflow:workflow_id(nome), checklist:checklist_id(nome, subgrupo_id)')
      .eq('empresa_id', empresaAtiva.id)
      .order('proxima_execucao')

    if (unidadeAtiva?.id) q = q.eq('unidade_id', unidadeAtiva.id)

    const { data } = await q
    let linhas: any[] = data ?? []

    // Workflow desabilitado: não lista agendamentos de workflow
    if (!WORKFLOWS_HABILITADO) linhas = linhas.filter(a => a.tipo_alvo !== 'workflow')

    // Gestor não-admin só vê agendamentos dos grupos/subgrupos a que pertence.
    // Checklist → subgrupo do checklist; Workflow → subgrupos dos itens do workflow.
    if (!isAdmin && user) {
      const { data: us } = await sb.from('usuario_subgrupo').select('subgrupo_id').eq('usuario_id', user.id)
      const meusSubgrupos = new Set((us ?? []).map((r: any) => r.subgrupo_id))

      const wfIds = [...new Set(linhas.filter(a => a.tipo_alvo === 'workflow' && a.workflow_id).map(a => a.workflow_id))]
      const wfSubs: Record<string, Set<string>> = {}
      if (wfIds.length) {
        const { data: est } = await sb.from('workflow_estagios')
          .select('workflow_id, itens:workflow_estagio_itens(subgrupo_id)')
          .in('workflow_id', wfIds)
        for (const e of (est ?? [])) {
          const set = wfSubs[e.workflow_id] ?? (wfSubs[e.workflow_id] = new Set<string>())
          for (const it of ((e as any).itens ?? [])) if (it.subgrupo_id) set.add(it.subgrupo_id)
        }
      }

      linhas = linhas.filter(a => {
        const cl = Array.isArray(a.checklist) ? a.checklist[0] : a.checklist
        return agendamentoVisivelGestor(
          { tipo_alvo: a.tipo_alvo, workflow_id: a.workflow_id, checklist_subgrupo_id: cl?.subgrupo_id ?? null },
          { isAdmin, meusSubgrupos },
          wfSubs,
        )
      })
    }

    const lista: Agendamento[] = linhas.map((a: any) => {
      const wf = Array.isArray(a.workflow) ? a.workflow[0] : a.workflow
      const cl = Array.isArray(a.checklist) ? a.checklist[0] : a.checklist
      return {
        id: a.id,
        tipo_alvo: a.tipo_alvo,
        workflow_id: a.workflow_id,
        checklist_id: a.checklist_id,
        alvo_nome: a.tipo_alvo === 'workflow' ? (wf?.nome ?? '—') : (cl?.nome ?? '—'),
        intervalo_unidade: a.intervalo_unidade,
        intervalo_valor: a.intervalo_valor,
        referencia_inicio: a.referencia_inicio,
        proxima_execucao: a.proxima_execucao,
        ultima_execucao_em: a.ultima_execucao_em,
        ativo: a.ativo,
      }
    })
    setAgendamentos(lista)
    setLoading(false)
  }

  async function alternarAtivo(ag: Agendamento) {
    setAlterando(ag.id)
    const sb = createClient()
    await sb.from('agendamentos').update({ ativo: !ag.ativo }).eq('id', ag.id)
    setAgendamentos(prev => prev.map(a => a.id === ag.id ? { ...a, ativo: !a.ativo } : a))
    setAlterando(null)
  }

  async function excluir(id: string) {
    if (!await confirm({ titulo: 'Excluir agendamento?', mensagem: 'Essa ação não pode ser desfeita.', confirmarLabel: 'Excluir', perigo: true })) return
    setAlterando(id)
    const sb = createClient()
    const { error } = await sb.from('agendamentos').delete().eq('id', id)
    setAlterando(null)
    if (error) { toast.error('Não foi possível excluir o agendamento.'); return }
    setAgendamentos(prev => prev.filter(a => a.id !== id))
    toast.success('Agendamento excluído.')
  }

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Nenhuma empresa selecionada.</p>
    </div>
  )

  const cfg = getOnboardingConfig('agendamentos')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Agendamentos</h1>
          <p className="text-xs text-gray-400 mt-0.5">Início programado e recorrente de workflows e checklists</p>
        </div>
        <Button onClick={() => unidadeAtiva ? setModalAberto(true) : toast.info('Selecione uma unidade para criar um agendamento.')}>
          <Plus size={16} />Novo
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : agendamentos.length === 0 ? (
        <div className="py-20 text-center">
          <Clock size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum agendamento cadastrado.</p>
          <p className="text-xs text-gray-400 mt-1">Programe o início automático e recorrente de workflows ou checklists.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {agendamentos.map(a => (
            <div key={a.id} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${a.tipo_alvo === 'workflow' ? 'bg-violet-50' : 'bg-blue-50'}`}>
                {a.tipo_alvo === 'workflow'
                  ? <GitBranch size={17} className="text-violet-500" />
                  : <CheckSquare size={17} className="text-blue-500" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800 truncate">{a.alvo_nome}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400">
                    A cada {a.intervalo_valor} {UNIDADE_LABEL[a.intervalo_unidade](a.intervalo_valor)}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-400">Ref.: {formatarData(a.referencia_inicio)}</span>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400">Próxima execução</p>
                <p className="text-sm font-medium text-gray-700">{formatarData(a.proxima_execucao)}</p>
              </div>

              <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${a.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {a.ativo ? <Power size={11} /> : <PowerOff size={11} />}
                {a.ativo ? 'Ativo' : 'Pausado'}
              </span>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setEditando(a)}
                  disabled={alterando === a.id}
                  title="Editar"
                  className="p-1.5 text-gray-400 hover:text-violet-500 rounded-lg hover:bg-violet-50 transition-colors disabled:opacity-50">
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => alternarAtivo(a)}
                  disabled={alterando === a.id}
                  title={a.ativo ? 'Pausar' : 'Ativar'}
                  className="p-1.5 text-gray-400 hover:text-violet-500 rounded-lg hover:bg-violet-50 transition-colors disabled:opacity-50">
                  {a.ativo ? <PowerOff size={15} /> : <Power size={15} />}
                </button>
                <button
                  onClick={() => excluir(a.id)}
                  disabled={alterando === a.id}
                  title="Excluir"
                  className="p-1.5 text-gray-300 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAberto && empresaAtiva && unidadeAtiva && (
        <NovoAgendamentoModal
          empresaId={empresaAtiva.id}
          unidadeId={unidadeAtiva.id}
          onClose={() => setModalAberto(false)}
          onCriado={() => { setModalAberto(false); carregar() }}
        />
      )}

      {editando && empresaAtiva && unidadeAtiva && (
        <NovoAgendamentoModal
          empresaId={empresaAtiva.id}
          unidadeId={unidadeAtiva.id}
          agendamento={editando}
          onClose={() => setEditando(null)}
          onCriado={() => { setEditando(null); carregar() }}
        />
      )}
    </>
  )
}
