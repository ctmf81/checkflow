'use client'

import { useState } from 'react'
import { Plus, Trash2, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PerfilModal } from './PerfilModal'

interface Perfil {
  id: string
  nome: string
  publico: boolean
  permissoes: string[]
  totalUsuarios: number
  isSystem?: boolean
}

const mock: Perfil[] = [
  { id: '1', nome: 'Admin de empresa',  publico: false, permissoes: [], totalUsuarios: 2,  isSystem: true },
  { id: '2', nome: 'Admin de sistema',  publico: false, permissoes: [], totalUsuarios: 1,  isSystem: true },
  { id: '3', nome: 'Admin do Setor',    publico: false, permissoes: [], totalUsuarios: 13 },
  { id: '4', nome: 'Gestão',            publico: false, permissoes: [], totalUsuarios: 6  },
  { id: '5', nome: 'Gestão do Setor',   publico: false, permissoes: [], totalUsuarios: 7  },
  { id: '6', nome: 'Líder',             publico: false, permissoes: [], totalUsuarios: 25 },
  { id: '7', nome: 'Operador',          publico: false, permissoes: [], totalUsuarios: 51 },
]

function AvatarStack({ total }: { total: number }) {
  const visible = Math.min(total, 3)
  const resto = total - visible
  return (
    <div className="flex items-center">
      {Array.from({ length: visible }).map((_, i) => (
        <div
          key={i}
          className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white -ml-2 first:ml-0 flex items-center justify-center"
        >
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
  const [modalAberto, setModalAberto] = useState(false)
  const [perfilEditando, setPerfilEditando] = useState<Perfil | undefined>()

  function abrirEdicao(p: Perfil) {
    setPerfilEditando(p)
    setModalAberto(true)
  }

  function abrirCriacao() {
    setPerfilEditando(undefined)
    setModalAberto(true)
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Perfis criados</span>
          <Button onClick={abrirCriacao}>
            <Plus size={16} />
            Criar novo perfil
          </Button>
        </div>

        {mock.map(perfil => (
          <div
            key={perfil.id}
            className="flex items-center justify-between px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
          >
            <button
              onClick={() => abrirEdicao(perfil)}
              className="text-sm font-medium text-gray-800 hover:text-orange-500 transition-colors text-left"
            >
              {perfil.nome}
            </button>

            <div className="flex items-center gap-3">
              <AvatarStack total={perfil.totalUsuarios} />
              {!perfil.isSystem && (
                <button className="text-gray-300 hover:text-red-400 transition-colors p-1 ml-1">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <PerfilModal
          perfil={perfilEditando}
          onClose={() => { setModalAberto(false); setPerfilEditando(undefined) }}
        />
      )}
    </>
  )
}
