'use client'

import { SessionProvider, useSession } from '@/contexts/SessionContext'
import { createClient } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, LayoutDashboard } from 'lucide-react'

function OperacaoHeader() {
  const { empresaAtiva } = useSession() as any
  const router = useRouter()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [temGestao, setTemGestao] = useState(false)

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login')
    })
    // Verifica se o usuário tem acesso à gestão (admin_sistema ou tem empresa ativa)
    createClient().auth.getUser().then(({ data }) => {
      const role = data?.user?.user_metadata?.role
      setTemGestao(role === 'admin_sistema' || role === 'usuario')
    })
  }, [])

  useEffect(() => {
    if (!empresaAtiva?.id) return
    createClient().from('empresas').select('logo_url').eq('id', empresaAtiva.id).single()
      .then(({ data }) => setLogoUrl(data?.logo_url ?? null))
  }, [empresaAtiva?.id])

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Logo / nome */}
        <div className="flex items-center gap-2">
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt="Logo" className="h-7 max-w-[120px] object-contain" />
            : <div className="flex items-center gap-1.5 text-orange-500 font-bold text-lg"><CheckSquare size={20} />CheckFlow</div>
          }
        </div>

        {/* Botão voltar para gestão */}
        {temGestao && (
          <button
            onClick={() => router.push('/gestao')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-orange-500 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-lg transition-colors">
            <LayoutDashboard size={14} />
            Gestão
          </button>
        )}
      </div>
    </header>
  )
}

export default function OperacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <OperacaoHeader />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
