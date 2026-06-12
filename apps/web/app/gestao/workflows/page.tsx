'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, GitBranch, Layers, Clock, CheckCircle2, EyeOff, MoreVertical, Play, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Button } from '@/components/ui/Button'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useToast } from '@/components/ui/feedback'

interface Workflow {
  id: string
  nome: string
  descricao: string | null
  status: 'rascunho' | 'publicado' | 'inativo'
  criado_em: string
  total_estagios: number
}

const STATUS_CFG = {
  rascunho:  { label: 'Rascunho',  cor: 'bg-yellow-100 text-yellow-700', Icon: Clock },
  publicado: { label: 'Publicado', cor: 'bg-green-100 text-green-700',   Icon: CheckCircle2 },
  inativo:   { label: 'Inativo',   cor: 'bg-gray-100 text-gray-500',     Icon: EyeOff },
}

export default function WorkflowsPage() {
  const { empresaAtiva, unidadeAtiva } = useSession()
  const toast = useToast()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [menuAberto, setMenuAberto] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState<string | null>(null)

  useEffect(() => { carregar() }, [empresaAtiva?.id])

  async function carregar() {
    if (!empresaAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('workflows')
      .select('id, nome, descricao, status, criado_em')
      .eq('empresa_id', empresaAtiva.id)
      .order('nome')

    if (!data) { setLoading(false); return }

    // Conta estágios em lote
    const ids = data.map(w => w.id)
    const { data: estagios } = ids.length
      ? await sb.from('workflow_estagios').select('workflow_id').in('workflow_id', ids)
      : { data: [] }

    const contagemMap: Record<string, number> = {}
    for (const e of (estagios ?? [])) {
      contagemMap[e.workflow_id] = (contagemMap[e.workflow_id] ?? 0) + 1
    }

    setWorkflows(data.map(w => ({ ...w, total_estagios: contagemMap[w.id] ?? 0 })))
    setLoading(false)
  }

  async function iniciarExecucao(workflowId: string) {
    if (!unidadeAtiva) { toast.info('Selecione uma unidade antes de iniciar.'); return }
    setIniciando(workflowId)
    setMenuAberto(null)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    const { data, error } = await sb.rpc('workflow_iniciar', {
      p_workflow_id: workflowId,
      p_unidade_id: unidadeAtiva.id,
      p_usuario_id: user?.id,
    })
    setIniciando(null)
    if (error) { toast.error('Erro ao iniciar: ' + error.message); return }
    window.location.href = `/gestao/workflows/${workflowId}/execucoes/${data}`
  }

  async function inativar(id: string) {
    setMenuAberto(null)
    const sb = createClient()
    await sb.from('workflows').update({ status: 'inativo' }).eq('id', id)
    setWorkflows(prev => prev.filter(w => w.id !== id))
  }

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Nenhuma empresa selecionada.</p>
    </div>
  )

  const cfg = getOnboardingConfig('workflows')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Workflows</h1>
          <p className="text-xs text-gray-400 mt-0.5">Pipelines de checklists com estágios e dependências</p>
        </div>
        <Link href="/gestao/workflows/novo">
          <Button><Plus size={16} />Novo workflow</Button>
        </Link>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : workflows.length === 0 ? (
        <div className="py-20 text-center">
          <GitBranch size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum workflow cadastrado.</p>
          <p className="text-xs text-gray-400 mt-1">Crie um para encadear checklists com dependências.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {workflows.map(w => {
            const cfg = STATUS_CFG[w.status]
            return (
              <div key={w.id} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <GitBranch size={17} className="text-violet-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <Link href={`/gestao/workflows/${w.id}`}
                    className="font-medium text-sm text-gray-800 hover:text-violet-600 transition-colors">
                    {w.nome}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      <Layers size={10} className="inline mr-0.5" />
                      {w.total_estagios} {w.total_estagios === 1 ? 'estágio' : 'estágios'}
                    </span>
                    {w.descricao && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-400 truncate max-w-[200px]">{w.descricao}</span>
                      </>
                    )}
                  </div>
                </div>

                <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.cor}`}>
                  <cfg.Icon size={11} />
                  {cfg.label}
                </span>

                <div className="flex items-center gap-1">
                  {w.status === 'publicado' && (
                    <button
                      onClick={() => iniciarExecucao(w.id)}
                      disabled={iniciando === w.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors disabled:opacity-50"
                    >
                      {iniciando === w.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Play size={13} />}
                      Iniciar
                    </button>
                  )}

                  <div className="relative">
                    <button
                      onClick={() => setMenuAberto(menuAberto === w.id ? null : w.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical size={15} />
                    </button>
                    {menuAberto === w.id && (
                      <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-36">
                        <Link href={`/gestao/workflows/${w.id}`}
                          className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                          Editar
                        </Link>
                        <Link href={`/gestao/workflows/${w.id}/execucoes`}
                          className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                          Execuções
                        </Link>
                        <button
                          onClick={() => inativar(w.id)}
                          className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                          Inativar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
