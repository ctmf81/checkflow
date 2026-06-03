import { Construction } from 'lucide-react'

interface Props {
  titulo?: string
}

export function EmConstrucao({ titulo }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Construction size={48} className="text-orange-300 mb-4" />
      <h2 className="text-lg font-semibold text-gray-700 mb-1">
        {titulo ?? 'Em construção'}
      </h2>
      <p className="text-sm text-gray-400">Esta funcionalidade está sendo desenvolvida.</p>
    </div>
  )
}
