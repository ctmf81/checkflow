'use client'

import { Header } from '@/components/layout/Header'
import { TermosGate } from '@/components/layout/TermosGate'
import { SessionProvider } from '@/contexts/SessionContext'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, MessageCircle } from 'lucide-react'

const SISTEMA_NAV = [
  { href: '/sistema',           label: 'Empresas',  icon: Building2 },
  { href: '/sistema/whatsapp',  label: 'WhatsApp',  icon: MessageCircle },
]

function SistemaNav() {
  const pathname = usePathname()
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-8 flex gap-1">
        {SISTEMA_NAV.map(({ href, label, icon: Icon }) => {
          const ativo = href === '/sistema' ? pathname === '/sistema' : pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                ativo
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              <Icon size={15} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <TermosGate />
        <Header />
        <SistemaNav />
        <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
