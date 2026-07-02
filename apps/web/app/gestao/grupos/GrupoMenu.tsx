'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Pencil, PowerOff } from 'lucide-react'

interface Props {
  grupoId: string
  grupoNome: string
  onEditar: () => void
  onExcluir: () => void
}

export function GrupoMenu({ grupoNome, onEditar, onExcluir }: Props) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative" onClick={e => e.preventDefault()}>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setAberto(!aberto) }}
        className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <MoreVertical size={16} />
      </button>

      {aberto && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 truncate">
            {grupoNome}
          </div>

          <button
            onClick={() => { setAberto(false); onEditar() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Pencil size={14} className="text-gray-400" />
            Editar grupo
          </button>

          <div className="border-t border-gray-100 mt-1">
            <button
              onClick={() => { setAberto(false); onExcluir() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              <PowerOff size={14} />
              Desativar grupo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
