'use client'

import { Header } from '@/components/layout/Header'
import { TermosGate } from '@/components/layout/TermosGate'
import { SessionProvider } from '@/contexts/SessionContext'
import { SidebarProvider, useSidebar } from '@/components/layout/SidebarContext'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import { Building2, MessageCircle, ShieldCheck, Compass, Handshake, Bot, Package, Boxes, LayoutGrid, BookOpen, X } from 'lucide-react'

const SISTEMA_NAV = [
  { href: '/sistema',           label: 'Empresas',     icon: Building2 },
  { href: '/sistema/planos',    label: 'Planos',       icon: Package },
  { href: '/sistema/pacotes',   label: 'Pacotes',      icon: Boxes },
  { href: '/sistema/templates', label: 'Modelos',      icon: LayoutGrid },
  { href: '/sistema/parceiros', label: 'Parceiros',    icon: Handshake },
  { href: '/sistema/whatsapp',  label: 'WhatsApp',     icon: MessageCircle },
  { href: '/sistema/integracoes-ia', label: 'IA',      icon: Bot },
  { href: '/sistema/ajuda',     label: 'Ajuda',        icon: BookOpen },
  { href: '/sistema/termos',    label: 'Termo de Uso', icon: ShieldCheck },
  { href: '/sistema/onboarding', label: 'Onboarding',  icon: Compass },
]

function SistemaSidebar() {
  const pathname = usePathname()
  const { aberta, fechar } = useSidebar()

  function ativo(href: string) {
    if (href === '/sistema') return pathname === '/sistema' || pathname.startsWith('/sistema/empresas')
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <>
      {aberta && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={fechar} aria-hidden="true" />}
      <aside className={clsx(
        'w-56 bg-white border-r border-gray-200 flex flex-col py-4 z-50',
        'fixed inset-y-0 left-0 transition-transform duration-200 lg:static lg:translate-x-0 lg:min-h-screen',
        aberta ? 'translate-x-0 shadow-xl' : '-translate-x-full',
      )}>
        <div className="px-4 mb-6 h-10 flex items-center justify-between">
          <span className="font-bold text-gray-800">Sistema</span>
          <button onClick={fechar} className="lg:hidden text-gray-400 hover:text-gray-600 p-1" aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {SISTEMA_NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={fechar}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                ativo(href)
                  ? 'bg-orange-50 text-orange-500 font-medium'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
              )}>
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  )
}

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SidebarProvider>
        <div className="flex min-h-screen bg-slate-50">
          <TermosGate />
          <SistemaSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl w-full mx-auto">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </SessionProvider>
  )
}
