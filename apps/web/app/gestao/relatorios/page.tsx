'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, FileBarChart2, AlertCircle, Pencil, Trash2, MoreVertical, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { usePolling } from '@/lib/usePolling'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { ehAdminDaEmpresa } from '@/lib/admin'
import { resolverAcoesRelatorios } from '@/lib/entitlements/gating'
import { podeCriarConteudo, MSG_CRIACAO_BLOQUEADA } from '@/lib/entitlements/assinaturaFase'
import { ModeloModal, type ModeloRelatorio } from './ModeloModal'

interface ModeloRow extends ModeloRelatorio {
  checklists: { nome: string } | { nome: string }[] | null
}

function nomeChecklist(m: ModeloRow): string {
  const c = Array.isArray(m.checklists) ? m.checklists[0] : m.checklists
  return c?.nome ?? '—'
}

function Menu({ podeEditar, podeExcluir, onEditar, onExcluir }: {
  podeEditar: boolean; podeExcluir: boolean; onEditar: () => void; onExcluir: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto(!aberto)} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          {podeEditar && (
            <button onClick={() => { setAberto(false); onEditar() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              <Pencil size={14} className="text-gray-400" />Editar modelo
            </button>
          )}
          {podeExcluir && (
            <div className={podeEditar ? 'border-t border-gray-100 mt-1' : ''}>
              <button onClick={() => { setAberto(false); onExcluir() }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50">
                <Trash2 size={14} />Excluir modelo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function RelatoriosPage() {
  const { unidadeAtiva, empresaAtiva, flagsHabilitadas, faseAssinatura } = useSession()
  const iaHabilitada = flagsHabilitadas === null || flagsHabilitadas.has('ia')
  const confirm = useConfirm()
  const toast = useToast()
  const [modelos, setModelos] = useState<ModeloRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [editando, setEditando] = useState<ModeloRelatorio | null>(null)
  // Permissões por ação do usuário (esconde botões que ele não pode usar; a RLS
  // é a barreira real). Admin de sistema/empresa tem tudo.
  const [perms, setPerms] = useState({ criar: false, editar: false, excluir: false })

  useEffect(() => {
    if (!empresaAtiva?.id) { setPerms({ criar: false, editar: false, excluir: false }); return }
    let cancel = false
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const isAdminSistema = user.app_metadata?.role === 'admin_sistema'
      const isAdminEmpresa = isAdminSistema ? false : await ehAdminDaEmpresa(sb, empresaAtiva.id)
      let permissoes: { recurso: string; acao: string }[] = []
      if (!isAdminSistema && !isAdminEmpresa) {
        const { data: ue } = await sb.from('usuario_empresa').select('perfil_id').eq('usuario_id', user.id).eq('empresa_id', empresaAtiva.id).maybeSingle()
        if (ue?.perfil_id) {
          const { data: pp } = await sb.from('perfil_permissoes').select('permissao:permissao_id(recurso, acao)').eq('perfil_id', ue.perfil_id)
          permissoes = (pp ?? []).map((row: any) => {
            const p = Array.isArray(row.permissao) ? row.permissao[0] : row.permissao
            return { recurso: p?.recurso, acao: p?.acao }
          }).filter((p: any) => p.recurso && p.acao)
        }
      }
      const acoes = resolverAcoesRelatorios({ isAdminSistema, isAdminEmpresa, permissoes })
      if (!cancel) setPerms({ criar: acoes.criar, editar: acoes.editar, excluir: acoes.excluir })
    })()
    return () => { cancel = true }
  }, [empresaAtiva?.id])

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const { data } = await createClient().from('relatorio_modelos')
      .select('id, nome, checklist_id, periodo_horas, prompt, checklists(nome)')
      .eq('unidade_id', unidadeAtiva.id).order('nome')
    setModelos((data ?? []) as ModeloRow[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])
  usePolling(carregar, 45000, !!unidadeAtiva?.id)

  async function excluir(m: ModeloRow) {
    if (!await confirm({ titulo: `Excluir "${m.nome}"?`, mensagem: 'Os relatórios já gerados por este modelo também serão removidos.', confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('relatorio_modelos').delete().eq('id', m.id)
    if (error) { toast.error('Não foi possível excluir.'); return }
    toast.success('Modelo excluído.')
    carregar()
  }

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  if (!iaHabilitada) return (
    <div className="py-16 text-center">
      <FileBarChart2 size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Relatórios por IA não incluídos no plano</p>
      <p className="text-xs text-gray-400 mt-1">Contrate os Serviços de IA para gerar relatórios das execuções.</p>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Relatórios</h1>
          <p className="hidden sm:block text-xs text-gray-400 mt-0.5">
            Modelos de relatório por IA · gere na <span className="font-medium text-orange-500">Home</span>
          </p>
        </div>
        {perms.criar && (
          !podeCriarConteudo(faseAssinatura)
            ? <Button disabled title={MSG_CRIACAO_BLOQUEADA}><Plus size={16} />Novo</Button>
            : <Button onClick={() => setModalNovo(true)}><Plus size={16} />Novo</Button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando…</div>
      ) : modelos.length === 0 ? (
        <div className="py-16 text-center">
          <FileBarChart2 size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum modelo cadastrado.</p>
          <p className="text-xs text-gray-400 mt-1">Crie um modelo escolhendo o checklist e o período.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {modelos.map(m => (
            <div key={m.id} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <FileBarChart2 size={18} className="text-gray-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800 truncate">{m.nome}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{nomeChecklist(m)}</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 bg-gray-100 text-gray-600">
                <Clock size={12} />últimas {m.periodo_horas}h
              </span>
              {(perms.editar || perms.excluir) && (
                <Menu
                  podeEditar={perms.editar}
                  podeExcluir={perms.excluir}
                  onEditar={() => setEditando({ id: m.id, nome: m.nome, checklist_id: m.checklist_id, periodo_horas: m.periodo_horas, prompt: m.prompt })}
                  onExcluir={() => excluir(m)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {modalNovo && (
        <ModeloModal unidadeId={unidadeAtiva.id}
          onClose={() => setModalNovo(false)}
          onSalvo={() => { setModalNovo(false); carregar() }} />
      )}
      {editando && (
        <ModeloModal unidadeId={unidadeAtiva.id} modelo={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }} />
      )}
    </>
  )
}
