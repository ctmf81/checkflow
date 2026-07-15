'use client'

import { useState, useEffect, use, useRef } from 'react'
import { Plus, Users, ChevronLeft, MoreVertical, Pencil, PowerOff, X, FileCheck, ChevronRight, ShieldCheck, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { NovoSubgrupoModal } from './NovoSubgrupoModal'
import { createClient } from '@/lib/supabase'
import { usePolling } from '@/lib/usePolling'
import { useSession } from '@/contexts/SessionContext'
import { useConfirm, useToast } from '@/components/ui/feedback'

interface Subgrupo {
  id: string
  nome: string
  descricao: string | null
  totalUsuarios: number
  totalChecklists: number
}

function SubgrupoMenu({ subgrupo, onEditar, onDesativar }: {
  subgrupo: Subgrupo
  onEditar: () => void
  onDesativar: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto(!aberto)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100 truncate">{subgrupo.nome}</div>
          <button onClick={() => { setAberto(false); onEditar() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Pencil size={14} className="text-gray-400" />Editar
          </button>
          <div className="border-t border-gray-100 mt-1">
            <button onClick={() => { setAberto(false); onDesativar() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
              <PowerOff size={14} />Desativar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditarSubgrupoModal({ subgrupo, onClose, onSalvo }: {
  subgrupo: Subgrupo
  onClose: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = useState(subgrupo.nome)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await createClient().from('subgrupos').update({
      nome, atualizado_em: new Date().toISOString()
    }).eq('id', subgrupo.id)
    setSalvando(false)
    if (error) { setErro('Erro ao salvar.'); return }
    onSalvo()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Editar</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              required />
          </div>
          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal de Funções ──────────────────────────────────────────────────────────

type Funcao = 'operacao' | 'nivel_1' | 'nivel_2' | null

interface UsuarioSubgrupo {
  usuario_id: string
  funcao: Funcao
  usuarios: { nome: string; email: string }
}

const FUNCOES: { valor: Funcao; label: string; desc: string; cor: string }[] = [
  { valor: null,       label: '—',         desc: 'Só visualiza',                       cor: 'border-gray-200 text-gray-400 bg-white' },
  { valor: 'operacao', label: 'Operação',  desc: 'Executa checklists',                 cor: 'border-blue-200 text-blue-600 bg-blue-50' },
  { valor: 'nivel_1',  label: 'Nível 1',   desc: 'Executa + modera planos de ação',    cor: 'border-amber-300 text-amber-700 bg-amber-50' },
  { valor: 'nivel_2',  label: 'Nível 2',   desc: 'Executa + N1 + escala planos',       cor: 'border-orange-400 text-orange-700 bg-orange-50' },
]

// Perfil de sistema "Operação" — não acessa a Gestão, logo não modera planos.
const PERFIL_OPERACAO_ID = '00000000-0000-0000-0000-000000000003'
const AVISO_SO_OPERACAO = 'Perfil "Operação" não acessa a Gestão, então não modera planos de ação. Para ser Nível 1/2, o usuário precisa de um perfil com acesso à Gestão (ex.: "Gestão do Grupo").'

function FuncoesModal({ subgrupo, onClose }: { subgrupo: Subgrupo; onClose: () => void }) {
  const { empresaAtiva } = useSession()
  const toast = useToast()
  const [usuarios, setUsuarios] = useState<UsuarioSubgrupo[]>([])
  const [perfis, setPerfis] = useState<Map<string, string>>(new Map()) // usuario_id -> perfil_id na empresa
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null) // usuario_id sendo salvo

  useEffect(() => {
    (async () => {
      const sb = createClient()
      const { data } = await sb.from('usuario_subgrupo')
        .select('usuario_id, funcao, usuarios(nome, email)')
        .eq('subgrupo_id', subgrupo.id).order('usuario_id')
      const lista = (data ?? []) as unknown as UsuarioSubgrupo[]
      setUsuarios(lista)
      if (empresaAtiva?.id && lista.length) {
        const { data: ues } = await sb.from('usuario_empresa')
          .select('usuario_id, perfil_id').eq('empresa_id', empresaAtiva.id)
          .in('usuario_id', lista.map(u => u.usuario_id))
        setPerfis(new Map((ues ?? []).map((r: any) => [r.usuario_id, r.perfil_id])))
      }
      setLoading(false)
    })()
  }, [subgrupo.id, empresaAtiva?.id])

  // Perfil "Operação" puro não modera — bloqueia N1/N2 para ele.
  function soOperacao(usuarioId: string) {
    return perfis.get(usuarioId) === PERFIL_OPERACAO_ID
  }

  async function alterarFuncao(usuarioId: string, novaFuncao: Funcao) {
    if ((novaFuncao === 'nivel_1' || novaFuncao === 'nivel_2') && soOperacao(usuarioId)) {
      toast.error(AVISO_SO_OPERACAO)
      return
    }
    setSalvando(usuarioId)
    await createClient()
      .from('usuario_subgrupo')
      .update({ funcao: novaFuncao })
      .eq('subgrupo_id', subgrupo.id)
      .eq('usuario_id', usuarioId)
    setUsuarios(prev => prev.map(u => u.usuario_id === usuarioId ? { ...u, funcao: novaFuncao } : u))
    setSalvando(null)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <ShieldCheck size={15} className="text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Funções</p>
              <p className="text-xs text-gray-400">{subgrupo.nome}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Legenda compacta — tooltip ao passar o mouse */}
        <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400">Funções:</span>
          {FUNCOES.map(f => (
            <div key={String(f.valor)} className="relative group">
              <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium cursor-default ${f.cor}`}>
                {f.label}
              </span>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                {f.desc}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
              </div>
            </div>
          ))}
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : usuarios.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">Nenhum usuário alocado nesta área.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {usuarios.map(u => {
                const funcaoAtual = u.funcao
                const isSalvando = salvando === u.usuario_id
                return (
                  <li key={u.usuario_id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{u.usuarios?.nome ?? '—'}</p>
                        <p className="text-xs text-gray-400 truncate">{u.usuarios?.email ?? ''}</p>
                      </div>
                      {isSalvando && <Loader2 size={14} className="animate-spin text-orange-400 flex-shrink-0 mt-1" />}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {FUNCOES.map(f => {
                        const ativa = funcaoAtual === f.valor
                        const bloqueado = (f.valor === 'nivel_1' || f.valor === 'nivel_2') && soOperacao(u.usuario_id)
                        return (
                          <button
                            key={String(f.valor)}
                            onClick={() => {
                              if (isSalvando || ativa) return
                              if (bloqueado) { toast.error(AVISO_SO_OPERACAO); return }
                              alterarFuncao(u.usuario_id, f.valor)
                            }}
                            disabled={isSalvando}
                            title={bloqueado ? AVISO_SO_OPERACAO : undefined}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50 ${
                              ativa
                                ? f.cor + ' ring-1 ring-offset-1 ' + (f.valor === null ? 'ring-gray-300' : f.valor === 'operacao' ? 'ring-blue-300' : f.valor === 'nivel_1' ? 'ring-amber-400' : 'ring-orange-400')
                                : bloqueado
                                ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed'
                                : 'border-gray-200 text-gray-400 bg-white hover:bg-gray-50'
                            }`}>
                            {ativa && <Check size={10} />}
                            {f.label}
                          </button>
                        )
                      })}
                    </div>
                    {soOperacao(u.usuario_id) && (
                      <p className="text-[11px] text-gray-400 mt-1.5">Perfil "Operação" — não modera planos. N1/N2 exigem um perfil com acesso à Gestão.</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SubgruposPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { subgrupoLabel } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const router = useRouter()
  const [modal, setModal] = useState(false)
  const [grupo, setGrupo] = useState<{ nome: string } | null>(null)
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Subgrupo | null>(null)
  const [funcoesSubgrupo, setFuncoesSubgrupo] = useState<Subgrupo | null>(null)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const { data: g } = await supabase.from('grupos').select('nome').eq('id', id).single()
    if (g) setGrupo(g)

    const { data: subs } = await supabase
      .from('subgrupos').select('id, nome, descricao')
      .eq('grupo_id', id).eq('status', 'ativo').order('nome')

    if (subs) {
      const comContagens = await Promise.all(subs.map(async s => {
        const [{ count: cUsuarios }, { count: cChecklists }] = await Promise.all([
          supabase.from('usuario_subgrupo').select('usuario_id', { count: 'exact', head: true }).eq('subgrupo_id', s.id),
          supabase.from('checklists').select('id', { count: 'exact', head: true }).eq('subgrupo_id', s.id).neq('status', 'inativo'),
        ])
        return { ...s, totalUsuarios: cUsuarios ?? 0, totalChecklists: cChecklists ?? 0 }
      }))
      setSubgrupos(comContagens)
    }
    setLoading(false)
  }

  async function desativar(sub: Subgrupo) {
    if (!await confirm({ titulo: `Desativar "${sub.nome}"?`, confirmarLabel: 'Desativar', perigo: true })) return
    const { error } = await createClient().from('subgrupos').update({ status: 'inativo' }).eq('id', sub.id)
    if (error) { toast.error('Não foi possível desativar.'); return }
    toast.success('Item desativado.')
    carregar()
  }

  useEffect(() => { carregar() }, [id])
  usePolling(carregar, 45000, !!id)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/gestao/grupos" className="text-gray-400 hover:text-orange-500 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <span className="font-semibold text-lg text-gray-800">{grupo?.nome ?? '...'}</span>
          <span className="text-gray-400">/</span>
          <span className="text-gray-500">{subgrupoLabel}</span>
        </div>
        <Button onClick={() => setModal(true)}>
          <Plus size={16} />Criar novo {subgrupoLabel.toLowerCase()}
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : subgrupos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-500">Nenhum {subgrupoLabel.toLowerCase()} cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subgrupos.map(sub => (
            <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">{sub.nome}</h2>
                <SubgrupoMenu
                  subgrupo={sub}
                  onEditar={() => setEditando(sub)}
                  onDesativar={() => desativar(sub)}
                />
              </div>
              <div className="flex gap-2 mb-3">
                <div className="flex items-center gap-1.5 bg-green-50 px-3 py-2 rounded-lg flex-1">
                  <Users size={14} className="text-green-400" />
                  <span className="text-green-500 font-bold text-sm">{sub.totalUsuarios}</span>
                  <span className="text-gray-500 text-xs">Usuários</span>
                </div>
                <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-2 rounded-lg flex-1">
                  <FileCheck size={14} className="text-orange-400" />
                  <span className="text-orange-500 font-bold text-sm">{sub.totalChecklists}</span>
                  <span className="text-gray-500 text-xs">Checklists</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFuncoesSubgrupo(sub)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ShieldCheck size={13} />Funções
                </button>
                <button
                  onClick={() => router.push(`/gestao/checklists?subgrupo=${sub.id}&subgrupoNome=${encodeURIComponent(sub.nome)}&grupo=${id}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-orange-500 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors">
                  Ver checklists <ChevronRight size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <NovoSubgrupoModal grupoId={id} subgrupoLabel={subgrupoLabel}
          onClose={() => setModal(false)} onCriado={() => { setModal(false); carregar() }} />
      )}

      {editando && (
        <EditarSubgrupoModal subgrupo={editando}
          onClose={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar() }} />
      )}

      {funcoesSubgrupo && (
        <FuncoesModal subgrupo={funcoesSubgrupo} onClose={() => setFuncoesSubgrupo(null)} />
      )}
    </>
  )
}
