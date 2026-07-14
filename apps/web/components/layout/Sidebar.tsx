'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import {
  Home, Users, CheckSquare, BarChart2, Settings,
  ChevronDown, ChevronUp, ClipboardList, Layers,
  Network, UserCircle, GitBranch, Clock, Ticket, X, CreditCard, ListChecks,
  FileBarChart2
} from 'lucide-react'
import { useSession } from '@/contexts/SessionContext'
import { useSidebar } from './SidebarContext'
import { createClient } from '@/lib/supabase'
import { ehAdminDaEmpresa } from '@/lib/admin'
import { WORKFLOWS_HABILITADO } from '@/lib/features'
import { itemVisivelNoMenu } from '@/lib/entitlements/gating'

// Cada item pode declarar como é liberado no menu:
//   - perm:  só aparece se o perfil do usuário tem ALGUMA permissão nesse recurso
//   - admin: só aparece para admin da empresa / admin de sistema
//   - nenhum dos dois: sempre visível (Home, e áreas sem permissão de perfil)
// Admin (empresa/sistema) vê tudo. Isto é UX (não é a barreira de segurança —
// essa é o RLS + a checagem de permissão nas ações/páginas).
//   - flag: exige uma CARACTERÍSTICA do plano (ex.: 'ia'). Quando presente, o
//     gate de plano é pela característica (flagsHabilitadas), não pelo recurso
//     módulo — usado por features de IA que não são um módulo próprio.
interface NavChild { label: string; href: string; perm?: string; admin?: boolean; flag?: string }
interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  perm?: string
  admin?: boolean
  flag?: string
  children?: NavChild[]
}

const nav: NavItem[] = [
  { label: 'Home',         href: '/gestao',                icon: Home },
  { label: 'Grupos',       href: '/gestao/grupos',         icon: Layers, perm: 'grupos' },
  {
    label: 'Tickets',
    icon: Ticket,
    children: [
      { label: 'Chamados',    href: '/gestao/tickets',            perm: 'ticket' },
      { label: 'Categorias',  href: '/gestao/tickets/categorias', perm: 'ticket' },
      { label: 'Config. SLA', href: '/gestao/tickets/sla',        perm: 'ticket' },
    ],
  },
  { label: 'Planos de Ação', href: '/gestao/planos-acao',  icon: ClipboardList },
  { label: 'Checklists',   href: '/gestao/checklists',     icon: CheckSquare, perm: 'checklists' },
  { label: 'Tarefas',      href: '/gestao/tarefas',        icon: ListChecks, perm: 'tarefas' },
  ...(WORKFLOWS_HABILITADO ? [{ label: 'Workflows', href: '/gestao/workflows', icon: GitBranch, perm: 'workflows' } as NavItem] : []),
  { label: 'Agendamentos', href: '/gestao/agendamentos',   icon: Clock, perm: 'agendamentos' },
  { label: 'Indicadores',  href: '/gestao/indicadores',    icon: BarChart2 },
  { label: 'Relatórios',   href: '/gestao/relatorios',     icon: FileBarChart2, perm: 'relatorios', flag: 'ia' },
  {
    label: 'Padrão',
    icon: Network,
    children: [
      { label: 'Variáveis',    href: '/gestao/padrao/variaveis', perm: 'padrao' },
      { label: 'Padrões',      href: '/gestao/padrao/padroes',   perm: 'padrao' },
    ],
  },
  {
    label: 'Acessos',
    icon: UserCircle,
    children: [
      { label: 'Empresa',   href: '/gestao/acessos/empresa',  perm: 'unidades' },
      { label: 'Perfis',    href: '/gestao/acessos/perfis',   perm: 'perfis' },
      { label: 'Turnos',    href: '/gestao/acessos/turnos',   perm: 'turnos' },
      { label: 'Usuários',  href: '/gestao/acessos/usuarios', perm: 'usuarios' },
    ],
  },
  { label: 'Plano',        href: '/gestao/plano',          icon: CreditCard, admin: true },
  {
    label: 'Configurações',
    icon: Settings,
    children: [
      { label: 'Catálogos',     href: '/gestao/configuracoes/catalogos',    perm: 'catalogos' },
      { label: 'Documentos',    href: '/gestao/configuracoes/documentos',   perm: 'documentos' },
      { label: 'Não execução',  href: '/gestao/configuracoes/nao-execucao', perm: 'nao_execucao' },
      { label: 'Causa raiz',    href: '/gestao/configuracoes/causa-raiz',   perm: 'causa_raiz' },
      { label: 'Formatação',    href: '/gestao/configuracoes/formatacao',   admin: true },
      { label: 'Notificações',  href: '/gestao/configuracoes/notificacoes', admin: true },
      { label: 'Relatórios',    href: '/gestao/configuracoes/relatorios',   admin: true },
      { label: 'Dashboards',    href: '/gestao/configuracoes/dashboards',   perm: 'dashboards' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { empresaAtiva, recursosHabilitados, flagsHabilitadas } = useSession()
  const { aberta, fechar } = useSidebar()
  const [open, setOpen] = useState<string[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Permissões do perfil do usuário na empresa ativa (recursos liberados) +
  // se é admin (vê tudo). Enquanto não carrega, itens com `perm`/`admin` ficam
  // ocultos e aparecem depois (nunca o contrário — não pisca item restrito).
  const [recursos, setRecursos] = useState<Set<string>>(new Set())
  const [isAdminSistema, setIsAdminSistema] = useState(false)  // plataforma: ignora plano
  const [isAdminEmpresa, setIsAdminEmpresa] = useState(false)  // vê tudo, mas limitado ao plano
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    if (!empresaAtiva?.id) { setLogoUrl(null); return }
    const sb = createClient()
    sb.from('empresas').select('logo_url').eq('id', empresaAtiva.id).single()
      .then(({ data }) => setLogoUrl(data?.logo_url ?? null))
  }, [empresaAtiva?.id])

  useEffect(() => {
    if (!empresaAtiva?.id) return
    const sb = createClient()
    let cancelado = false
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const adminSis = user.user_metadata?.role === 'admin_sistema'
      const adminEmp = adminSis ? false : await ehAdminDaEmpresa(sb, empresaAtiva.id)
      if (cancelado) return
      setIsAdminSistema(adminSis); setIsAdminEmpresa(adminEmp)
      if (adminSis || adminEmp) { setCarregado(true); return }

      // Recursos liberados pelo perfil do usuário nesta empresa.
      const { data: ue } = await sb.from('usuario_empresa')
        .select('perfil_id').eq('usuario_id', user.id).eq('empresa_id', empresaAtiva.id).maybeSingle()
      let set = new Set<string>()
      if (ue?.perfil_id) {
        const { data: pp } = await sb.from('perfil_permissoes')
          .select('permissao:permissao_id(recurso)').eq('perfil_id', ue.perfil_id)
        set = new Set((pp ?? []).map((r: any) => (Array.isArray(r.permissao) ? r.permissao[0] : r.permissao)?.recurso).filter(Boolean))
      }
      if (cancelado) return
      setRecursos(set); setCarregado(true)
    })()
    return () => { cancelado = true }
  }, [empresaAtiva?.id])

  // Visibilidade de um item folha — lógica pura centralizada em lib/entitlements
  // (mesma coberta por testes). Admin sistema vê tudo; o plano barra por
  // característica (flag) ou recurso-módulo; usuário comum precisa da permissão.
  function folhaVisivel(it: { perm?: string; admin?: boolean; flag?: string }): boolean {
    return itemVisivelNoMenu(it, {
      isAdminSistema, isAdminEmpresa, recursosHabilitados, flagsHabilitadas, recursos, carregado,
    })
  }
  function itemVisivel(it: NavItem): boolean {
    if (it.children) return it.children.some(folhaVisivel)
    return folhaVisivel(it)
  }

  const navVisivel = nav
    .map(it => it.children ? { ...it, children: it.children.filter(folhaVisivel) } : it)
    .filter(itemVisivel)

  function toggle(label: string) {
    setOpen(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
  }

  // Um href "casa" com a rota atual se for igual ou prefixo dela. Só o MAIS
  // específico (mais longo) fica ativo, para nunca destacar dois itens juntos.
  function casa(href: string) {
    if (href === '/gestao') return pathname === '/gestao'
    return pathname === href || pathname.startsWith(href + '/')
  }
  const todosHrefs = navVisivel.flatMap(i => i.children ? i.children.map(c => c.href) : [i.href!])
  const maisEspecifico = todosHrefs.filter(casa).sort((a, b) => b.length - a.length)[0] ?? null
  function isActive(href: string) { return href === maisEspecifico }
  function hasActiveChild(children: { href: string }[]) { return children.some(c => isActive(c.href)) }

  return (
    <>
      {/* Overlay do drawer — só no mobile, quando aberta */}
      {aberta && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={fechar} aria-hidden="true" />
      )}

      <aside className={clsx(
        'w-56 bg-white border-r border-gray-200 flex flex-col py-4 z-50',
        'fixed inset-y-0 left-0 transition-transform duration-200 lg:static lg:translate-x-0 lg:min-h-screen',
        aberta ? 'translate-x-0 shadow-xl' : '-translate-x-full'
      )}>
        <div className="px-4 mb-6 h-10 flex items-center justify-between">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="max-h-8 max-w-[180px] object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo-checkflow.png" alt="CheckFlow" className="max-h-8 max-w-[180px] object-contain" />
          )}
          {/* Fechar — só no mobile */}
          <button onClick={fechar} className="lg:hidden text-gray-400 hover:text-gray-600 p-1" aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {navVisivel.map(item => {
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
