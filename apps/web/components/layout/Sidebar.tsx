'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import { Home, Users, CheckSquare, BarChart2, Settings, Building2, ChevronDown } from 'lucide-react'

const nav = [
  { label: 'Home',          href: '/gestao',           icon: Home },
  { label: 'Empresas',      href: '/gestao/empresas',  icon: Building2 },
  { label: 'Checklists',    href: '/gestao/checklists', icon: CheckSquare },
  { label: 'Indicadores',   href: '/gestao/indicadores', icon: BarChart2 },
  { label: 'Acessos',       href: '/gestao/acessos',   icon: Users, children: true },
  { label: 'Configurações', href: '/gestao/configuracoes', icon: Settings, children: true },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col py-4">
      <div className="px-4 mb-6">
        <span className="text-xl font-bold text-orange-500 tracking-tight">CheckFlow</span>
      </div>
      <nav className="flex-1 px-2 space-y-0.5">
        {nav.map(({ label, href, icon: Icon, children }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-orange-50 text-orange-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon size={16} />
                {label}
              </span>
              {children && <ChevronDown size={14} className="text-gray-400" />}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
