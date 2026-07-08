'use client'

import { SessionProvider, useSession } from '@/contexts/SessionContext'
import { createClient } from '@/lib/supabase'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, LogOut, UserCircle, ChevronDown } from 'lucide-react'
import { EscolherEmpresaModal } from '@/components/layout/EscolherEmpresaModal'
import { TermosGate } from '@/components/layout/TermosGate'
import { AvisoTurno } from '@/components/layout/AvisoTurno'
import { InstallAppButton } from '@/components/pwa/InstallAppButton'
import { PendingSync } from '@/components/pwa/PendingSync'

function OperacaoHeader() {
  const { empresaAtiva } = useSession()
  const router = useRouter()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [temGestao, setTemGestao] = useState(false)
  const [nome, setNome] = useState('')
  const [dropUsuario, setDropUsuario] = useState(false)
  const refUsuario = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login')
    })
    // Carrega o nome do usuário para o menu.
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user
      if (user) {
        supabase.from('usuarios').select('nome').eq('id', user.id).single()
          .then(({ data }) => { if (data?.nome) setNome(data.nome) })
      }
    })
    // Redireciona se a sessão for encerrada — mas só quando ONLINE. Offline, um
    // refresh de token que falha por falta de rede não deve expulsar o operador
    // de campo para o login (a sessão continua válida no aparelho).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_OUT' || !session) && navigator.onLine) router.replace('/login')
    })
    function handleClick(e: MouseEvent) {
      if (refUsuario.current && !refUsuario.current.contains(e.target as Node)) setDropUsuario(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!empresaAtiva?.id) return
    const supabase = createClient()
    supabase.from('empresas').select('logo_url').eq('id', empresaAtiva.id).single()
      .then(({ data }) => setLogoUrl(data?.logo_url ?? null))
    // Mostra botão Gestão apenas se o perfil não for o de Operação puro (…003)
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user
      if (!user) return
      if (user.user_metadata?.role === 'admin_sistema') { setTemGestao(true); return }
      supabase.from('usuario_empresa')
        .select('perfil_id')
        .eq('usuario_id', user.id)
        .eq('empresa_id', empresaAtiva.id)
        .maybeSingle()
        .then(({ data: ue }) => {
          setTemGestao(!!ue && ue.perfil_id !== '00000000-0000-0000-0000-000000000003')
        })
    })
  }, [empresaAtiva?.id])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Navegação DURA p/ sair na hora (router.push + refresh exigia reload manual).
    window.location.href = '/login'
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Logo / nome */}
        <div className="flex items-center gap-2 min-w-0">
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt="Logo" className="h-7 max-w-[120px] object-contain" />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src="/logo-checkflow.png" alt="CheckFlow" className="h-7 max-w-[140px] object-contain" />
          }
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Instalar app (PWA) */}
          <InstallAppButton />

          {/* Botão voltar para gestão — só no desktop; no mobile vai pro menu */}
          {temGestao && (
            <button
              onClick={() => router.push('/gestao')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-orange-500 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-lg transition-colors">
              <LayoutDashboard size={14} />
              Gestão
            </button>
          )}

          {/* Menu do usuário — identidade + Sair (operador em campo também precisa sair) */}
          <div ref={refUsuario} className="relative">
            <button
              onClick={() => setDropUsuario(v => !v)}
              className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
              aria-label="Menu do usuário">
              <UserCircle size={26} className="text-orange-400" />
              <span className="hidden sm:block text-sm font-medium max-w-[140px] truncate">{nome || '...'}</span>
              <ChevronDown size={14} className="text-orange-500" />
            </button>

            {dropUsuario && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                {nome && (
                  <p className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-100 truncate">{nome}</p>
                )}
                {/* Gestão dentro do menu — só no mobile (no desktop é botão à parte) */}
                {temGestao && (
                  <button onClick={() => { setDropUsuario(false); router.push('/gestao') }}
                    className="sm:hidden w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors border-b border-gray-100">
                    <LayoutDashboard size={16} className="text-orange-400" />
                    Gestão
                  </button>
                )}
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <LogOut size={16} />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default function OperacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <TermosGate />
        <EscolherEmpresaModal />
        <OperacaoHeader />
        <PendingSync />
        <AvisoTurno />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
