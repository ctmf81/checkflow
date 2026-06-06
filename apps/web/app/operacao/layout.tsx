'use client'

import { SessionProvider, useSession } from '@/contexts/SessionContext'
import { createClient } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { CheckSquare, LogOut, ChevronDown } from 'lucide-react'

function OperacaoHeader() {
  const { empresaAtiva, unidadeAtiva, setUnidadeAtiva } = useSession() as any
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([])
  const [menuAberto, setMenuAberto] = useState(false)

  useEffect(() => {
    if (!empresaAtiva?.id) return
    const sb = createClient()
    sb.from('empresas').select('logo_url').eq('id', empresaAtiva.id).single()
      .then(({ data }) => setLogoUrl(data?.logo_url ?? null))
    sb.from('unidades').select('id, nome').eq('empresa_id', empresaAtiva.id).order('nome')
      .then(({ data }) => { if (data) setUnidades(data) })
  }, [empresaAtiva?.id])

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Logo / nome */}
        <div className="flex items-center gap-2">
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt="Logo" className="h-7 max-w-[120px] object-contain" />
            : <div className="flex items-center gap-1.5 text-orange-500 font-bold text-lg"><CheckSquare size={20} />CheckFlow</div>
          }
        </div>

        {/* Seletor de unidade */}
        {unidades.length > 1 && (
          <div className="relative">
            <button onClick={() => setMenuAberto(!menuAberto)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              {unidadeAtiva?.nome ?? 'Selecionar unidade'}
              <ChevronDown size={14} />
            </button>
            {menuAberto && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-44 py-1">
                {unidades.map(u => (
                  <button key={u.id} onClick={() => { setUnidadeAtiva(u); setMenuAberto(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      u.id === unidadeAtiva?.id ? 'text-orange-500 font-medium bg-orange-50' : 'text-gray-700 hover:bg-gray-50'
                    }`}>
                    {u.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unidade única — só mostra o nome */}
        {unidades.length === 1 && (
          <span className="text-sm text-gray-500">{unidadeAtiva?.nome}</span>
        )}
      </div>
    </header>
  )
}

export default function OperacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <OperacaoHeader />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
