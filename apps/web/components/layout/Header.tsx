'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut, UserCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export function Header() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [perfil, setPerfil] = useState('Admin de sistema')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from('usuarios')
          .select('nome')
          .eq('id', user.id)
          .single()
          .then(({ data }) => {
            if (data?.nome) setNome(data.nome)
          })
      }
    })
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-end px-6 gap-4">
      <button className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900">
        <span className="font-medium">Unidade</span>
        <ChevronDown size={14} className="text-orange-500" />
      </button>

      <div className="w-px h-6 bg-gray-200" />

      <button className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900">
        <UserCircle size={28} className="text-orange-400" />
        <div className="text-left">
          <p className="font-medium leading-tight">{nome || 'Carregando...'}</p>
          <p className="text-xs text-gray-500 leading-tight">{perfil}</p>
        </div>
        <ChevronDown size={14} className="text-orange-500" />
      </button>

      <button onClick={handleLogout} className="ml-1 text-gray-400 hover:text-gray-600" title="Sair">
        <LogOut size={18} />
      </button>
    </header>
  )
}
