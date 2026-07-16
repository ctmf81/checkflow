'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, UserCircle, AlertCircle, Upload, PowerOff, ChevronDown, LogIn, Loader2, KeyRound, QrCode, UserCheck, RotateCcw, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { UsuarioModal } from './UsuarioModal'
import { ImportarUsuariosModal } from './ImportarUsuariosModal'
import { QrPreCadastroModal } from './QrPreCadastroModal'
import { ModeracaoPreCadastroModal } from './ModeracaoPreCadastroModal'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { usePolling } from '@/lib/usePolling'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useToast, useConfirm } from '@/components/ui/feedback'

interface Usuario {
  id: string
  nome: string
  email: string
  cpf: string | null
  telefone: string | null
  perfil: string
  perfilId?: string
  unidades: { id: string; nome: string }[]
  turnoId?: string | null
  status?: string
}

interface Perfil { id: string; nome: string }

export default function UsuariosPage() {
  const { empresaAtiva } = useSession()
  const toast = useToast()
  const confirm = useConfirm()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [importarAberto, setImportarAberto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | undefined>()
  const [loading, setLoading] = useState(true)
  const [perfilDropdown, setPerfilDropdown] = useState<string | null>(null)
  const [impersonandoId, setImpersonandoId] = useState<string | null>(null)
  const [isAdminSistema, setIsAdminSistema] = useState(false)
  const [resetandoId, setResetandoId] = useState<string | null>(null)
  const [qrAberto, setQrAberto] = useState(false)
  const [moderacaoAberto, setModeracaoAberto] = useState(false)
  const [pendentesCount, setPendentesCount] = useState(0)
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [reativandoId, setReativandoId] = useState<string | null>(null)
  const [podeImportar, setPodeImportar] = useState(false)
  const [podeAprovarPre, setPodeAprovarPre] = useState(false)

  // Verifica se usuário logado é admin_sistema + permissões granulares dos botões
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data }) => {
      const admin = data?.user?.user_metadata?.role === 'admin_sistema'
      setIsAdminSistema(admin)
    })
    sb.rpc('usuario_tem_permissao', { p_recurso: 'usuarios', p_acao: 'importar' })
      .then(({ data }) => setPodeImportar(!!data))
    sb.rpc('usuario_tem_permissao', { p_recurso: 'usuarios', p_acao: 'aprovar_precadastro' })
      .then(({ data }) => setPodeAprovarPre(!!data))
  }, [])

  async function loginComo(email: string, usuarioId: string) {
    setImpersonandoId(usuarioId)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const token = session?.access_token
      if (!token) { toast.error('Sessão inválida.'); return }

      const res = await fetch('/api/usuarios/impersonar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (!res.ok || !json.link) { toast.error(json.message ?? 'Erro ao gerar link.'); return }

      window.location.href = json.link
    } catch (e: any) {
      toast.error(e.message ?? 'Erro inesperado.')
    } finally {
      setImpersonandoId(null)
    }
  }

  async function carregar() {
    if (!empresaAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()

    const [ueRes, perfisRes] = await Promise.all([
      supabase.from('usuario_empresa')
        .select('usuario:usuario_id(id, nome, email, cpf, telefone, status, turno_id), perfil:perfil_id(id, nome)')
        .eq('empresa_id', empresaAtiva.id),
      supabase.from('perfis').select('id, nome')
        .or(`empresa_id.eq.${empresaAtiva.id},empresa_id.is.null`).order('nome'),
    ])

    if (ueRes.data) {
      setUsuarios(ueRes.data
        .filter((r: any) => r.usuario != null)
        .map((r: any) => ({
          id: r.usuario.id,
          nome: r.usuario.nome,
          email: r.usuario.email,
          cpf: r.usuario.cpf,
          telefone: r.usuario.telefone,
          perfil: r.perfil?.nome ?? '',
          perfilId: r.perfil?.id ?? '',
          unidades: [],
          turnoId: r.usuario.turno_id ?? null,
          status: r.usuario.status,
        })))
    }
    if (perfisRes.data) setPerfis(perfisRes.data)
    setLoading(false)

    // Contador de pré-cadastros pendentes (best-effort: tabela pode não existir
    // se a migration ainda não foi aplicada).
    const { count } = await supabase.from('pre_cadastros')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaAtiva.id).eq('status', 'pendente')
    setPendentesCount(count ?? 0)
  }

  async function inativar(usuarioId: string) {
    if (!await confirm({ titulo: 'Inativar este usuário?', mensagem: 'Ele perde o acesso ao sistema imediatamente.', confirmarLabel: 'Inativar', perigo: true })) return
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/usuarios/inativar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ usuarioId }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      toast.error(json?.error ?? 'Não foi possível inativar o usuário.')
      return
    }
    toast.success('Usuário inativado.')
    carregar()
  }

  async function reativar(usuarioId: string) {
    if (!await confirm({ titulo: 'Reativar este usuário?', mensagem: 'Ele voltará a ter acesso ao sistema.', confirmarLabel: 'Reativar' })) return
    setReativandoId(usuarioId)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/usuarios/reativar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ usuarioId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        toast.error(json?.error ?? 'Não foi possível reativar o usuário.')
        return
      }
      toast.success('Usuário reativado.')
      carregar()
    } finally {
      setReativandoId(null)
    }
  }

  async function resetarSenha(usuario: Usuario) {
    if (!usuario.telefone) {
      toast.error('Este usuário não possui telefone cadastrado para receber o código de redefinição.')
      return
    }
    if (!await confirm({ titulo: 'Redefinir senha?', mensagem: `Será enviado um código de redefinição para ${usuario.nome} via WhatsApp.`, confirmarLabel: 'Enviar código' })) return
    setResetandoId(usuario.id)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const token = session?.access_token
      if (!token) { toast.error('Sessão inválida.'); return }

      const res = await fetch('/api/usuarios/resetar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ usuarioId: usuario.id }),
      })
      const json = await res.json()
      if (res.ok) toast.success(json.message ?? 'Código enviado.')
      else toast.error(json.message ?? 'Erro ao enviar código.')
    } catch (e: any) {
      toast.error(e.message ?? 'Erro inesperado.')
    } finally {
      setResetandoId(null)
    }
  }

  async function alterarPerfil(usuarioId: string, perfilId: string) {
    if (!empresaAtiva?.id) return
    setPerfilDropdown(null)
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/usuarios/alterar-perfil', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ usuarioId, empresaId: empresaAtiva.id, perfilId }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Erro ao alterar perfil.')
      return
    }
    carregar()
  }

  useEffect(() => { carregar() }, [empresaAtiva?.id])
  usePolling(carregar, 45000, !!empresaAtiva?.id)

  const filtrados = usuarios
    .filter(u => mostrarInativos ? true : u.status !== 'inativo')
    .filter(u =>
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      u.email.toLowerCase().includes(busca.toLowerCase()) ||
      (u.cpf ?? '').includes(busca)
    )

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma empresa selecionada</p>
      <p className="text-xs text-gray-400 mt-1">Acesse uma empresa pelo Painel de sistema.</p>
    </div>
  )

  const cfg = getOnboardingConfig('acessos-usuarios')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuários</span>
            <p className="hidden sm:block text-xs text-gray-400 mt-0.5">Empresa: <span className="text-orange-500 font-medium">{empresaAtiva.nome}</span></p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {(isAdminSistema || podeAprovarPre) && (
              <button onClick={() => setQrAberto(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                <QrCode size={14} />QR pré-cadastro
              </button>
            )}
            {(isAdminSistema || podeAprovarPre) && (
              <button onClick={() => setModeracaoAberto(true)}
                className="relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                <UserCheck size={14} />Pré-cadastros
                {pendentesCount > 0 && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-[11px] font-bold text-white bg-orange-500 rounded-full">{pendentesCount}</span>
                )}
              </button>
            )}
            {(isAdminSistema || podeImportar) && (
              <button onClick={() => setImportarAberto(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                <Upload size={14} />Importar
              </button>
            )}
            <Button onClick={() => { setUsuarioEditando(undefined); setModalAberto(true) }}>
              <Plus size={16} />Novo
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-b border-gray-100">
          <div className="relative w-full sm:w-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou CPF"
              className="pl-8 pr-4 py-1.5 text-sm border-b border-gray-200 bg-transparent focus:outline-none focus:border-orange-400 w-full sm:w-56 transition-colors" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setMostrarInativos(!mostrarInativos)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${mostrarInativos ? 'border-orange-300 text-orange-500 bg-orange-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              {mostrarInativos ? <Eye size={13} /> : <EyeOff size={13} />}
              {mostrarInativos ? 'Ocultar inativos' : 'Mostrar inativos'}
            </button>
            <span className="text-sm text-gray-500">Quantidade: <span className="font-medium text-gray-700">{filtrados.length}</span></span>
          </div>
        </div>

        {loading && filtrados.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center">
            <UserCircle size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nenhum usuário nesta empresa.</p>
          </div>
        ) : filtrados.map(usuario => (
          <div key={usuario.id} className={`flex items-center px-6 py-3 border-b border-gray-100 last:border-0 transition-colors ${usuario.status === 'inativo' ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}>
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mr-3 flex-shrink-0">
              <UserCircle size={24} className="text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <button onClick={() => { if (usuario.status !== 'inativo') { setUsuarioEditando(usuario); setModalAberto(true) } }}
                  className={`font-medium text-sm transition-colors text-left ${usuario.status === 'inativo' ? 'text-gray-400 cursor-default' : 'text-gray-800 hover:text-orange-500'}`}>
                  {usuario.nome}
                </button>
                {usuario.status === 'inativo' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 font-medium">Inativo</span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate">{usuario.email}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Perfil com dropdown */}
              <div className="relative">
                <button
                  onClick={() => setPerfilDropdown(perfilDropdown === usuario.id ? null : usuario.id)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-500 border border-gray-200 hover:border-orange-300 px-2 py-1 rounded-lg transition-colors"
                >
                  {(usuario as any).perfilId ? usuario.perfil || 'Perfil' : 'Perfil'}
                  <ChevronDown size={11} />
                </button>
                {perfilDropdown === usuario.id && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                    {perfis.map(p => (
                      <button key={p.id} onClick={() => alterarPerfil(usuario.id, p.id)}
                        className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                          (usuario as any).perfilId === p.id ? 'text-orange-500 font-medium bg-orange-50' : 'text-gray-700 hover:bg-gray-50'
                        }`}>
                        {p.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Login como (desativado temporariamente — problema de redirect no Railway) */}

              {/* Inativar / Reativar */}
              {usuario.status === 'inativo' ? (
                <button onClick={() => reativar(usuario.id)} disabled={reativandoId === usuario.id}
                  className="text-gray-300 hover:text-green-500 transition-colors p-1 disabled:opacity-50" title="Reativar usuário">
                  {reativandoId === usuario.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                </button>
              ) : (
                <button onClick={() => inativar(usuario.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors p-1" title="Inativar usuário">
                  <PowerOff size={15} />
                </button>
              )}

              {/* Reset senha */}
              <button
                onClick={() => resetarSenha(usuario)}
                disabled={resetandoId === usuario.id}
                className="text-gray-300 hover:text-orange-400 transition-colors p-1 disabled:opacity-50"
                title="Resetar senha (envia código por WhatsApp)"
              >
                {resetandoId === usuario.id
                  ? <Loader2 size={15} className="animate-spin" />
                  : <KeyRound size={15} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {importarAberto && empresaAtiva && (
        <ImportarUsuariosModal
          empresaId={empresaAtiva.id}
          onClose={() => setImportarAberto(false)}
          onImportado={() => { setImportarAberto(false); carregar() }}
        />
      )}

      {modalAberto && (
        <UsuarioModal
          usuario={usuarioEditando}
          empresaId={empresaAtiva.id}
          onClose={() => { setModalAberto(false); carregar() }}
        />
      )}

      {qrAberto && (
        <QrPreCadastroModal
          empresaId={empresaAtiva.id}
          empresaNome={empresaAtiva.nome}
          onClose={() => setQrAberto(false)}
        />
      )}

      {moderacaoAberto && (
        <ModeracaoPreCadastroModal
          empresaId={empresaAtiva.id}
          onClose={() => setModeracaoAberto(false)}
          onChange={() => carregar()}
        />
      )}
    </>
  )
}
