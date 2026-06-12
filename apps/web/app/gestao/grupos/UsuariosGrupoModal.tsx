'use client'

import { useEffect, useState } from 'react'
import { X, Users, Pencil, PowerOff, RefreshCw, Check, ChevronDown, ChevronUp, Loader2, UserCircle, Phone, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/feedback'

interface Props {
  grupoId: string
  grupoNome: string
  subgrupoLabel: string
  onClose: () => void
  onAlterado?: () => void
}

interface Subgrupo { id: string; nome: string }

interface UsuarioGrupo {
  id: string
  nome: string
  email: string
  telefone: string | null
  subgrupos: string[] // IDs dos subgrupos vinculados
}

// ─── Sub-modal: Editar nome / telefone ───────────────────────────────────────

function EditarUsuarioModal({ usuario, onClose, onSalvo }: {
  usuario: UsuarioGrupo
  onClose: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = useState(usuario.nome)
  const [telefone, setTelefone] = useState(usuario.telefone ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Nome é obrigatório.'); return }
    setSalvando(true)
    const { error } = await createClient()
      .from('usuarios')
      .update({ nome: nome.trim(), telefone: telefone.trim() || null })
      .eq('id', usuario.id)
    setSalvando(false)
    if (error) { setErro('Erro ao salvar.'); return }
    onSalvo()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">Editar usuário</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefone / WhatsApp</label>
            <input value={telefone} onChange={e => setTelefone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>
          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-3 py-2">Cancelar</button>
            <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Sub-modal: Subgrupos do usuário ─────────────────────────────────────────

function SubgruposUsuarioModal({ usuario, grupoId, subgrupoLabel, onClose, onSalvo }: {
  usuario: UsuarioGrupo
  grupoId: string
  subgrupoLabel: string
  onClose: () => void
  onSalvo: () => void
}) {
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])
  const [selecionados, setSelecionados] = useState<string[]>(usuario.subgrupos)
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient().from('subgrupos').select('id, nome')
      .eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data); setLoading(false) })
  }, [grupoId])

  function toggle(id: string) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  async function salvar() {
    setSalvando(true)
    const supabase = createClient()

    // Remove todos os vínculos atuais do usuário neste grupo
    const subgrupoIds = subgrupos.map(s => s.id)
    if (subgrupoIds.length > 0) {
      await supabase.from('usuario_subgrupo')
        .delete()
        .eq('usuario_id', usuario.id)
        .in('subgrupo_id', subgrupoIds)
    }

    // Reinsere os selecionados
    if (selecionados.length > 0) {
      await supabase.from('usuario_subgrupo').upsert(
        selecionados.map(sid => ({ usuario_id: usuario.id, subgrupo_id: sid }))
      )
    }

    setSalvando(false)
    onSalvo()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Acesso a {subgrupoLabel}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{usuario.nome}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-300" /></div>
          ) : subgrupos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum {subgrupoLabel.toLowerCase()} cadastrado.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
              {subgrupos.map(s => {
                const sel = selecionados.includes(s.id)
                return (
                  <button key={s.id} type="button" onClick={() => toggle(s.id)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                      sel ? 'bg-orange-50 text-orange-600 font-medium' : 'text-gray-700 hover:bg-gray-50'
                    }`}>
                    <span>{s.nome}</span>
                    {sel && <Check size={14} className="text-orange-500" />}
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-xs text-gray-400 mb-4">Se nenhum for selecionado, o usuário terá acesso a todos.</p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">Cancelar</button>
            <Button onClick={salvar} disabled={salvando || loading}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────────────

export function UsuariosGrupoModal({ grupoId, grupoNome, subgrupoLabel, onClose, onAlterado }: Props) {
  const confirm = useConfirm()
  const [usuarios, setUsuarios] = useState<UsuarioGrupo[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<UsuarioGrupo | null>(null)
  const [subgruposUsuario, setSubgruposUsuario] = useState<UsuarioGrupo | null>(null)
  const [enviandoSenha, setEnviandoSenha] = useState<string | null>(null)
  const [inativando, setInativando] = useState<string | null>(null)
  const [senhaEnviada, setSenhaEnviada] = useState<string | null>(null)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()

    const { data: ug } = await supabase
      .from('usuario_grupo')
      .select('usuario:usuario_id(id, nome, email, telefone)')
      .eq('grupo_id', grupoId)

    if (!ug) { setLoading(false); return }

    const uids = ug.map((r: any) => r.usuario?.id).filter(Boolean)

    // Busca subgrupos de cada usuário neste grupo
    const { data: subs } = await supabase
      .from('usuario_subgrupo')
      .select('usuario_id, subgrupo_id, subgrupos!inner(grupo_id)')
      .eq('subgrupos.grupo_id', grupoId)
      .in('usuario_id', uids)

    const subgruposPorUsuario: Record<string, string[]> = {}
    subs?.forEach((s: any) => {
      if (!subgruposPorUsuario[s.usuario_id]) subgruposPorUsuario[s.usuario_id] = []
      subgruposPorUsuario[s.usuario_id].push(s.subgrupo_id)
    })

    setUsuarios(
      ug
        .map((r: any) => r.usuario)
        .filter(Boolean)
        .map((u: any) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          telefone: u.telefone,
          subgrupos: subgruposPorUsuario[u.id] ?? [],
        }))
        .sort((a: UsuarioGrupo, b: UsuarioGrupo) => a.nome.localeCompare(b.nome))
    )
    setLoading(false)
  }

  async function reenviarSenha(usuario: UsuarioGrupo) {
    setEnviandoSenha(usuario.id)
    await createClient().auth.resetPasswordForEmail(usuario.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setEnviandoSenha(null)
    setSenhaEnviada(usuario.id)
    setTimeout(() => setSenhaEnviada(null), 3000)
  }

  async function inativar(usuario: UsuarioGrupo) {
    if (!await confirm({ titulo: `Remover "${usuario.nome}" deste grupo?`, confirmarLabel: 'Remover', perigo: true })) return
    setInativando(usuario.id)
    const supabase = createClient()
    await supabase.from('usuario_grupo').delete()
      .eq('usuario_id', usuario.id).eq('grupo_id', grupoId)
    setInativando(null)
    onAlterado?.()
    carregar()
  }

  useEffect(() => { carregar() }, [grupoId])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Users size={15} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Usuários do grupo</p>
                <p className="text-xs text-gray-400">{grupoNome}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          {/* Lista */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={20} className="animate-spin text-gray-300" />
              </div>
            ) : usuarios.length === 0 ? (
              <div className="py-16 text-center">
                <UserCircle size={36} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Nenhum usuário neste grupo.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {usuarios.map(u => (
                  <li key={u.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{u.nome}</p>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Mail size={10} />{u.email}
                          </span>
                          {u.telefone && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Phone size={10} />{u.telefone}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">
                          {u.subgrupos.length === 0
                            ? <span className="text-gray-300 italic">Todos os {subgrupoLabel.toLowerCase()}</span>
                            : <span className="text-orange-500 font-medium">{u.subgrupos.length} {subgrupoLabel.toLowerCase()}</span>
                          }
                        </p>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Editar */}
                        <button
                          onClick={() => setEditando(u)}
                          title="Editar nome e telefone"
                          className="p-2 text-gray-300 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>

                        {/* Subgrupos */}
                        <button
                          onClick={() => setSubgruposUsuario(u)}
                          title={`Gerenciar ${subgrupoLabel.toLowerCase()}`}
                          className="p-2 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
                          <Users size={14} />
                        </button>

                        {/* Reenviar senha */}
                        <button
                          onClick={() => reenviarSenha(u)}
                          disabled={enviandoSenha === u.id}
                          title="Reenviar senha"
                          className={`p-2 rounded-lg transition-colors ${
                            senhaEnviada === u.id
                              ? 'text-green-500 bg-green-50'
                              : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50'
                          }`}>
                          {enviandoSenha === u.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : senhaEnviada === u.id
                            ? <Check size={14} />
                            : <RefreshCw size={14} />}
                        </button>

                        {/* Inativar */}
                        <button
                          onClick={() => inativar(u)}
                          disabled={inativando === u.id}
                          title="Remover do grupo"
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          {inativando === u.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <PowerOff size={14} />}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
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

      {editando && (
        <EditarUsuarioModal
          usuario={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}

      {subgruposUsuario && (
        <SubgruposUsuarioModal
          usuario={subgruposUsuario}
          grupoId={grupoId}
          subgrupoLabel={subgrupoLabel}
          onClose={() => setSubgruposUsuario(null)}
          onSalvo={() => { setSubgruposUsuario(null); carregar() }}
        />
      )}
    </>
  )
}
