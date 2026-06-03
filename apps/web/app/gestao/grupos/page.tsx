'use client'

import { useState } from 'react'
import { Plus, MoreVertical, Sun, FileText, Users } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { NovoGrupoModal } from './NovoGrupoModal'

interface Grupo {
  id: string
  nome: string
  totalAreas: number
  totalChecklists: number
  totalUsuarios: number
}

const mock: Grupo[] = [
  { id: '1', nome: 'CQPA',       totalAreas: 3, totalChecklists: 4,  totalUsuarios: 37 },
  { id: '2', nome: 'Digital',    totalAreas: 1, totalChecklists: 7,  totalUsuarios: 1  },
  { id: '3', nome: 'Esmaltação', totalAreas: 5, totalChecklists: 4,  totalUsuarios: 2  },
  { id: '4', nome: 'Logística',  totalAreas: 5, totalChecklists: 3,  totalUsuarios: 22 },
  { id: '5', nome: 'Moagem',     totalAreas: 3, totalChecklists: 4,  totalUsuarios: 6  },
  { id: '6', nome: 'Prensa',     totalAreas: 4, totalChecklists: 0,  totalUsuarios: 4  },
]

export default function GruposPage() {
  const [modal, setModal] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Grupos</h1>
        <Button onClick={() => setModal(true)}>
          <Plus size={16} />
          Criar novo grupo
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mock.map(grupo => (
          <Link
            key={grupo.id}
            href={`/gestao/grupos/${grupo.id}/subgrupos`}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow block"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">{grupo.nome}</h2>
              <button
                className="text-gray-400 hover:text-gray-600 p-1"
                onClick={e => e.preventDefault()}
              >
                <MoreVertical size={16} />
              </button>
            </div>

            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-2 rounded-lg flex-1">
                <Sun size={14} className="text-orange-400" />
                <span className="text-orange-500 font-bold text-sm">{grupo.totalAreas}</span>
                <span className="text-gray-500 text-xs">Áreas</span>
              </div>

              <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-2 rounded-lg flex-1">
                <FileText size={14} className="text-blue-400" />
                <span className="text-blue-500 font-bold text-sm">{grupo.totalChecklists}</span>
                <span className="text-gray-500 text-xs">Checklists</span>
              </div>

              <div className="flex items-center gap-1.5 bg-green-50 px-3 py-2 rounded-lg flex-1">
                <Users size={14} className="text-green-400" />
                <span className="text-green-500 font-bold text-sm">{grupo.totalUsuarios}</span>
                <span className="text-gray-500 text-xs">Usuários</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {modal && <NovoGrupoModal onClose={() => setModal(false)} />}
    </>
  )
}
