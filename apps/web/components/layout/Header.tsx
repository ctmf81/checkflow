'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronDown, LogOut, UserCircle, Building2, LayoutDashboard, Settings, Menu, User } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useSidebarOptional } from './SidebarContext'
import { InstallAppButton } from '@/components/pwa/InstallAppButton'
import { PushBell } from '@/components/pwa/PushBell'
import { UsuarioModal } from '@/app/gestao/acessos/usuarios/UsuarioModal'

interface UsuarioParaModal {
  id: string; nome: string; email: string; cpf: string | null
  telefone: string | null; perfil: string; perfilId?: string
  unidades: { id: string; nome: string }[]; turnoId?: string | null
}

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const isSistema = pathname.startsWith('/sistema')
  const sidebar = useSidebarOptional()
  const { unidades, unidadeAtiva, setUnidadeAtiva, setAmbiente, setEmpresaAtiva, empresaAtiva, empresas, trocarEmpresa } = useSession()
  const [nome, setNome] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [dropUsuario, setDropUsuario] = useState(false)
  const refUsuario = useRef<HTMLDivElement>(null)
  const [minhaContaAberta, setMinhaContaAberta] = useState(false)
  const [minhaContaDados, setMinhaContaDados] = useState<UsuarioParaModal | null>(null)
  const [minhaContaCarregando, setMinhaContaCarregando] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setIsAdmin(user.app_metadata?.role === 'admin_sistema')
      supabase.from('usuarios').select('nome').eq('id', user.id).single()
        .then(({ data }) => { if (data?.nome) setNome(data.nome) })
    })

    // Atualiza o nome no header quando UsuarioModal edita o próprio usuário na lista
    function onNomeAtualizado(e: Event) {
      const nome = (e as CustomEvent<{ nome: string }>).detail?.nome
      if (nome) setNome(nome)
    }
    window.addEventListener('usuario-nome-atualizado', onNomeAtualizado)

    // Redireciona ao login se a sessão expirar/cair durante o uso
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.replace('/login')
    })

    function handleClick(e: MouseEvent) {
      if (refUsuario.current && !refUsuario.current.contains(e.target as Node)) setDropUsuario(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('usuario-nome-atualizado', onNomeAtualizado)
      authSub.subscription.unsubscribe()
    }
  }, [])

  async function abrirMinhaConta() {
    setDropUsuario(false)
    if (minhaContaDados) { setMinhaContaAberta(true); return }
    setMinhaContaCarregando(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const empId = empresaAtiva?.id
      const [{ data: u }, { data: vinculo }, { data: unids }] = await Promise.all([
        supabase.from('usuarios').select('id,nome,email,cpf,telefone,turno_id').eq('id', user.id).single(),
        empId
          ? supabase.from('usuario_empresa').select('perfil_id, perfil:perfil_id(nome)')
              .eq('usuario_id', user.id).eq('empresa_id', empId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('usuario_unidade').select('unidade:unidade_id(id,nome)').eq('usuario_id', user.id),
      ])

      if (!u) return
      const perfilRow = vinculo as any
      const unidadesRow = (unids ?? []) as any[]
      setMinhaContaDados({
        id: u.id,
        nome: u.nome,
        email: u.email ?? '',
        cpf: u.cpf,
        telefone: u.telefone,
        perfil: perfilRow?.perfil?.nome ?? '',
        perfilId: perfilRow?.perfil_id ?? undefined,
        unidades: unidadesRow.map((r: any) => r.unidade).filter(Boolean),
        turnoId: u.turno_id ?? null,
      })
      setMinhaContaAberta(true)
    } finally {
      setMinhaContaCarregando(false)
    }
  }

  async function handleLogout() {
    const supabase = createClient()
    // Esquece a empresa escolhida para que o próximo login pergunte de novo
    // (multi-empresa). A última unidade permanece. Best-effort: não trava o logout.
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('sessao_usuario').update({ ultima_empresa_id: null }).eq('usuario_id', user.id)
    } catch { /* segue o logout mesmo se falhar */ }
    await supabase.auth.signOut()
    // Navegação DURA: garante que a sessão saia da tela imediatamente. Com
    // router.push + refresh a tela continuava "logada" até um reload manual.
    window.location.href = '/login'
  }

  function irPara(ambiente: 'gestao' | 'operacao' | 'sistema') {
    setDropUsuario(false)
    if (ambiente === 'sistema') {
      setAmbiente('sistema')
      router.push('/sistema')
    } else {
      setAmbiente(ambiente)
      router.push(ambiente === 'gestao' ? '/gestao' : '/operacao')
    }
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-4 relative z-40">

      {/* Botão hambúrguer — abre o drawer da sidebar no mobile (só na Gestão) */}
      {sidebar && (
        <button
          onClick={sidebar.alternar}
          className="lg:hidden text-gray-500 hover:text-gray-700 p-1 -ml-1"
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>
      )}

      <div className="flex-1" />

      {/* Seletor de unidade — <select> nativo: no mobile abre o picker do
          aparelho, que respeita a largura da tela (não estoura como um dropdown). */}
      {!isSistema && (
        <div className="relative shrink-0 flex items-center">
          <select
            value={unidadeAtiva?.id ?? ''}
            onChange={e => { const u = unidades.find(x => x.id === e.target.value); if (u) setUnidadeAtiva(u) }}
            aria-label="Selecionar unidade"
            className="appearance-none bg-transparent text-sm font-medium text-gray-700 hover:text-gray-900 pr-5 max-w-[110px] sm:max-w-[220px] truncate focus:outline-none cursor-pointer"
          >
            {!unidadeAtiva && <option value="">Unidade</option>}
            {unidades.length === 0
              ? <option value="" disabled>Nenhuma unidade</option>
              : unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <ChevronDown size={14} className="text-orange-500 absolute right-0 pointer-events-none" />
        </div>
      )}

      {!isSistema && <div className="w-px h-6 bg-gray-200" />}

      {/* Instalar app (PWA) — fora do painel de sistema */}
      {!isSistema && <InstallAppButton />}

      {/* Sino: lembrete para ativar notificações push (some quando indisponível) */}
      {!isSistema && <PushBell />}

      {!isSistema && <div className="w-px h-6 bg-gray-200" />}

      {/* Seletor de usuário — no /sistema mostra só nome + logout sem dropdown */}
      <div ref={refUsuario} className="relative shrink-0">
        <button
          onClick={() => !isSistema && setDropUsuario(!dropUsuario)}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
        >
          <UserCircle size={28} className="text-orange-400 hidden sm:block" />
          <div className="text-left hidden sm:block">
            <p className="font-medium leading-tight">{nome || '...'}</p>
            <p className="text-xs text-gray-500 leading-tight">{isAdmin ? 'Admin de sistema' : 'Usuário'}</p>
          </div>
          {!isSistema && <ChevronDown size={14} className="text-orange-500" />}
        </button>

        {dropUsuario && !isSistema && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
            <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">Alterar módulo</p>

            <button onClick={() => irPara('gestao')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
              <LayoutDashboard size={16} className="text-orange-400" />
              Gestão
            </button>

            <button onClick={() => irPara('operacao')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
              <Settings size={16} className="text-orange-400" />
              Operação
            </button>

            {isAdmin && (
              <button onClick={() => irPara('sistema')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                <Building2 size={16} className="text-orange-400" />
                Painel de sistema
              </button>
            )}

            {empresas.length > 1 && (
              <button onClick={() => { setDropUsuario(false); trocarEmpresa() }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                <Building2 size={16} className="text-orange-400" />
                Trocar empresa
              </button>
            )}

            <div className="border-t border-gray-100 mt-1">
              <button onClick={abrirMinhaConta} disabled={minhaContaCarregando}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors disabled:opacity-50">
                <User size={16} className="text-orange-400" />
                {minhaContaCarregando ? 'Carregando...' : 'Minha conta'}
              </button>
              <button onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors">
                <LogOut size={16} />
                Sair
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Logout direto no /sistema */}
      {isSistema && (
        <button onClick={handleLogout} className="ml-2 text-gray-400 hover:text-red-500 transition-colors" title="Sair">
          <LogOut size={18} />
        </button>
      )}

      {minhaContaAberta && minhaContaDados && (
        <UsuarioModal
          usuario={minhaContaDados}
          empresaId={empresaAtiva?.id}
          onClose={() => {
            setMinhaContaAberta(false)
            // Atualiza o nome no header se o usuário o alterou
            setMinhaContaDados(null)
            const supabase = createClient()
            supabase.auth.getUser().then(({ data: { user } }) => {
              if (!user) return
              supabase.from('usuarios').select('nome').eq('id', user.id).single()
                .then(({ data }) => { if (data?.nome) setNome(data.nome) })
            })
          }}
        />
      )}

    </header>
  )
}
