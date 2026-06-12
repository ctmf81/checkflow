'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import {
  Home, Users, CheckSquare, BarChart2, Settings,
  ChevronDown, ChevronUp, ClipboardList, Layers,
  Network, UserCircle, GitBranch, Clock, Ticket, X
} from 'lucide-react'
import { useSession } from '@/contexts/SessionContext'
import { useSidebar } from './SidebarContext'
import { createClient } from '@/lib/supabase'

interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  children?: { label: string; href: string }[]
}

const nav: NavItem[] = [
  { label: 'Home',         href: '/gestao',                icon: Home },
  { label: 'Grupos',       href: '/gestao/grupos',         icon: Layers },
  {
    label: 'Tickets',
    icon: Ticket,
    children: [
      { label: 'Chamados',    href: '/gestao/tickets' },
      { label: 'Categorias',  href: '/gestao/tickets/categorias' },
      { label: 'Config. SLA', href: '/gestao/tickets/sla' },
    ],
  },
  { label: 'Planos de Ação', href: '/gestao/planos-acao',  icon: ClipboardList },
  { label: 'Checklists',   href: '/gestao/checklists',     icon: CheckSquare },
  { label: 'Workflows',    href: '/gestao/workflows',      icon: GitBranch },
  { label: 'Agendamentos', href: '/gestao/agendamentos',   icon: Clock },
  { label: 'Indicadores',  href: '/gestao/indicadores',    icon: BarChart2 },
  {
    label: 'Padrão',
    icon: Network,
    children: [
      { label: 'Variáveis',    href: '/gestao/padrao/variaveis' },
      { label: 'Padrões',      href: '/gestao/padrao/padroes' },
    ],
  },
  {
    label: 'Acessos',
    icon: UserCircle,
    children: [
      { label: 'Empresa',   href: '/gestao/acessos/empresa' },
      { label: 'Perfis',    href: '/gestao/acessos/perfis' },
      { label: 'Turnos',    href: '/gestao/acessos/turnos' },
      { label: 'Usuários',  href: '/gestao/acessos/usuarios' },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings,
    children: [
      { label: 'Catálogos',     href: '/gestao/configuracoes/catalogos' },
      { label: 'Documentos',    href: '/gestao/configuracoes/documentos' },
      { label: 'Não execução',  href: '/gestao/configuracoes/nao-execucao' },
      { label: 'Formatação',    href: '/gestao/configuracoes/formatacao' },
      { label: 'Relatórios',    href: '/gestao/configuracoes/relatorios' },
      { label: 'Dashboards',    href: '/gestao/configuracoes/dashboards' },
      { label: 'Causa raiz',    href: '/gestao/configuracoes/causa-raiz' },
      { label: 'Notificações',  href: '/gestao/configuracoes/notificacoes' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { empresaAtiva } = useSession()
  const { aberta, fechar } = useSidebar()
  const [open, setOpen] = useState<string[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaAtiva?.id) { setLogoUrl(null); return }
    createClient()
      .from('empresas').select('logo_url').eq('id', empresaAtiva.id).single()
      .then(({ data }) => setLogoUrl(data?.logo_url ?? null))
  }, [empresaAtiva?.id])

  function toggle(label: string) {
    setOpen(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  // Um href "casa" com a rota atual se for igual ou prefixo dela.
  // Vários podem casar ao mesmo tempo (ex: /gestao/tickets e
  // /gestao/tickets/sla) — só o MAIS específico (mais longo) fica ativo,
  // para nunca destacar dois itens do menu simultaneamente.
  function casa(href: string) {
    if (href === '/gestao') return pathname === '/gestao'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const todosHrefs = nav.flatMap(i => i.children ? i.children.map(c => c.href) : [i.href!])
  const maisEspecifico = todosHrefs.filter(casa).sort((a, b) => b.length - a.length)[0] ?? null

  function isActive(href: string) {
    return href === maisEspecifico
  }

  function hasActiveChild(children: { href: string }[]) {
    return children.some(c => isActive(c.href))
  }

  return (
    <>
      {/* Overlay do drawer — só no mobile, quando aberta */}
      {aberta && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={fechar} aria-hidden="true" />
      )}

      <aside className={clsx(
        'w-56 bg-white border-r border-gray-200 flex flex-col py-4 z-50',
        // Mobile: drawer fixo deslizante. Desktop (lg+): coluna fixa no fluxo.
        'fixed inset-y-0 left-0 transition-transform duration-200 lg:static lg:translate-x-0 lg:min-h-screen',
        aberta ? 'translate-x-0 shadow-xl' : '-translate-x-full'
      )}>
        <div className="px-4 mb-6 h-10 flex items-center justify-between">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="max-h-8 max-w-[180px] object-contain" />
          ) : (
            <span className="text-xl font-bold text-orange-500 tracking-tight">CheckFlow</span>
          )}
          {/* Fechar — só no mobile */}
          <button onClick={fechar} className="lg:hidden text-gray-400 hover:text-gray-600 p-1" aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {nav.map(item => {
          if (!item.children) {
            const active = isActive(item.href!)
            return (
              <Link
                key={item.label}
                href={item.href!}
                onClick={fechar}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-orange-50 text-orange-500 font-medium'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                )}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            )
          }

          const expanded = open.includes(item.label) || hasActiveChild(item.children)

          return (
            <div key={item.label}>
              <button
                onClick={() => toggle(item.label)}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                  hasActiveChild(item.children)
                    ? 'text-gray-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                )}
              >
                <span className="flex items-center gap-2.5">
                  <item.icon size={18} />
                  {item.label}
                </span>
                {expanded
                  ? <ChevronUp size={14} className="text-gray-400" />
                  : <ChevronDown size={14} className="text-gray-400" />}
              </button>

              {expanded && (
                <div className="ml-9 mt-0.5 space-y-0.5">
                  {item.children.map(child => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={fechar}
                      className={clsx(
                        'block px-3 py-1.5 rounded-lg text-sm transition-colors',
                        isActive(child.href)
                          ? 'text-orange-500 font-medium'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      )}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      </aside>
    </>
  )
}
