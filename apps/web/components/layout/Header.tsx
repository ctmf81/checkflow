'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronDown, LogOut, UserCircle, Building2, LayoutDashboard, Settings, Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useSidebarOptional } from './SidebarContext'

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const isSistema = pathname.startsWith('/sistema')
  const sidebar = useSidebarOptional()
  const { unidades, unidadeAtiva, setUnidadeAtiva, setAmbiente, setEmpresaAtiva } = useSession()
  const [nome, setNome] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [dropUnidade, setDropUnidade] = useState(false)
  const [dropUsuario, setDropUsuario] = useState(false)
  const refUnidade = useRef<HTMLDivElement>(null)
  const refUsuario = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setIsAdmin(user.user_metadata?.role === 'admin_sistema')
      supabase.from('usuarios').select('nome').eq('id', user.id).single()
        .then(({ data }) => { if (data?.nome) setNome(data.nome) })
    })

    // Redireciona ao login se a sessão expirar/cair durante o uso
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.replace('/login')
    })

    function handleClick(e: MouseEvent) {
      if (refUnidade.current && !refUnidade.current.contains(e.target as Node)) setDropUnidade(false)
      if (refUsuario.current && !refUsuario.current.contains(e.target as Node)) setDropUsuario(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      authSub.subscription.unsubscribe()
    }
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
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

      {/* Seletor de unidade — oculto no painel de sistema */}
      {!isSistema && <div ref={refUnidade} className="relative shrink-0">
        <button
          onClick={() => setDropUnidade(!dropUnidade)}
          className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 max-w-[90px] sm:max-w-none"
        >
          <span className="font-medium truncate">{unidadeAtiva?.nome ?? 'Unidade'}</span>
          <ChevronDown size={14} className="text-orange-500 shrink-0" />
        </button>

        {dropUnidade && (
          <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 max-h-80 overflow-y-auto">
            <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">Unidades</p>
            {unidades.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">Nenhuma unidade</p>
            ) : unidades.map(u => (
              <button
                key={u.id}
                onClick={() => { setUnidadeAtiva(u); setDropUnidade(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${unidadeAtiva?.id === u.id ? 'text-orange-500 font-medium bg-orange-50' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {u.nome}
              </button>
            ))}
          </div>
        )}
      </div>}

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

            <div className="border-t border-gray-100 mt-1">
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

    </header>
  )
}
