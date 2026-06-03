import { clsx } from 'clsx'

type BadgeVariant = 'ativo' | 'inativo' | 'pendente' | 'bloqueada'

const variants: Record<BadgeVariant, string> = {
  ativo:     'bg-green-100 text-green-700',
  inativo:   'bg-gray-100 text-gray-600',
  pendente:  'bg-yellow-100 text-yellow-700',
  bloqueada: 'bg-red-100 text-red-700',
}

export function Badge({ status }: { status: BadgeVariant }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', variants[status])}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
