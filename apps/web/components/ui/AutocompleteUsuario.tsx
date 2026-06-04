'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'

interface Usuario { id: string; nome: string; email: string }

interface Props {
  usuarios: Usuario[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
}

export function AutocompleteUsuario({ usuarios, value, onChange, placeholder = 'Buscar usuário...' }: Props) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selecionado = usuarios.find(u => u.id === value)

  const filtrados = busca.length > 0
    ? usuarios.filter(u =>
        u.nome.toLowerCase().includes(busca.toLowerCase()) ||
        u.email.toLowerCase().includes(busca.toLowerCase())
      )
    : usuarios

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function selecionar(u: Usuario) {
    onChange(u.id)
    setBusca('')
    setAberto(false)
  }

  function limpar() {
    onChange('')
    setBusca('')
  }

  return (
    <div ref={ref} className="relative">
      {selecionado ? (
        <div className="flex items-center justify-between px-3 py-2 border border-orange-200 rounded-lg bg-orange-50">
          <div>
            <p className="text-sm font-medium text-gray-800">{selecionado.nome}</p>
            <p className="text-xs text-gray-500">{selecionado.email}</p>
          </div>
          <button type="button" onClick={limpar} className="text-gray-400 hover:text-red-500 ml-2">
            <X size={15} />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => { setBusca(e.target.value); setAberto(true) }}
              onFocus={() => setAberto(true)}
              placeholder={placeholder}
              className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>

          {aberto && filtrados.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              {filtrados.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => selecionar(u)}
                  className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors border-b border-gray-100 last:border-0"
                >
                  <p className="text-sm font-medium text-gray-800">{u.nome}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </button>
              ))}
            </div>
          )}

          {aberto && busca.length > 0 && filtrados.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 px-4 py-3">
              <p className="text-sm text-gray-400">Nenhum usuário encontrado.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
