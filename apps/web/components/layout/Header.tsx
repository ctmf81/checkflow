'use client'

import { ChevronDown, LogOut, UserCircle } from 'lucide-react'

export function Header() {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-end px-6 gap-4">
      {/* Seletor de empresa */}
      <button className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900">
        <span className="font-medium">Empresa</span>
        <ChevronDown size={14} className="text-orange-500" />
      </button>

      <div className="w-px h-6 bg-gray-200" />

      {/* Usuário */}
      <button className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900">
        <UserCircle size={28} className="text-orange-400" />
        <div className="text-left">
          <p className="font-medium leading-tight">Usuário</p>
          <p className="text-xs text-gray-500 leading-tight">Admin de sistema</p>
        </div>
        <ChevronDown size={14} className="text-orange-500" />
      </button>

      <button className="ml-1 text-gray-400 hover:text-gray-600">
        <LogOut size={18} />
      </button>
    </header>
  )
}
