'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PerfilModal } from './PerfilModal'
import { createClient } from '@/lib/supabase'

interface Perfil {
  id: string
  nome: string
  publico: boolean
  permissoes: string[]
  totalUsuarios: number
  is_system: boolean
}

function AvatarStack({ total }: { total: number }) {
  const visible = Math.min(total, 3)
  const resto = total - visible
  return (
    <div className="flex items-center">
      {Array.from({ length: visible }).map((_, i) => (
        <div key={i} className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white -ml-2 first:ml-0 flex items-center justify-center">
          <UserCircle size={20} className="text-gray-400" />
        </div>
      ))}
      {resto > 0 && (
        <div className="w-8 h-8 rounded-full bg-blue-50 border-2 border-white -ml-2 flex items-center justify-center">
          <span className="text-xs font-semibold text-blue-500">+{resto}</span>
        </div>
      )}
    </div>
  )
}

export default function PerfisPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [perfilEditando, setPerfilEditando] = useState<Perfil | undefined>()

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('perfis').select('id, nome, is_system').order('nome')
    if (data) {
      const comContagens = await Promise.all(data.map(async p => {
        const { count } = await supabase.from('usuario_empresa').select('usuario_id', { count: 'exact', head: true }).eq('perfil_id', p.id)
        return { ...p, publico: false, permissoes: [], totalUsuarios: count ?? 0 }
      }))
      setPerfis(comContagens)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Perfis criados</span>
          <Button onClick={() => { setPerfilEditando(undefined); setModalAberto(true) }}>
            <Plus size={16} />Criar novo perfil
          </Button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
        ) : perfis.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">Nenhum perfil cadastrado.</div>
        ) : perfis.map(perfil => (
          <div key={perfil.id} className="flex items-center justify-between px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
            <button onClick={() => { setPerfilEditando(perfil); setModalAberto(true) }}
              className="text-sm font-medium text-gray-800 hover:text-orange-500 transition-colors text-left">
              {perfil.nome}
            </button>
            <div className="flex items-center gap-3">
              <AvatarStack total={perfil.totalUsuarios} />
              {!perfil.is_system && (
                <button className="text-gray-300 hover:text-red-400 transition-colors p-1 ml-1">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <PerfilModal perfil={perfilEditando} onClose={() => { setModalAberto(false); carregar() }} />
      )}
    </>
  )
}
