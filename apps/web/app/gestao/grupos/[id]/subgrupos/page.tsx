'use client'

import { useState } from 'react'
import { use } from 'react'
import { Plus, MoreVertical, FileText, Users, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { NovoSubgrupoModal } from './NovoSubgrupoModal'

interface Subgrupo {
  id: string
  nome: string
  totalChecklists: number
  totalUsuarios: number
  avatares: number
}

const mockGrupos: Record<string, { nome: string; subgrupos: Subgrupo[] }> = {
  '1': {
    nome: 'CQPA',
    subgrupos: [
      { id: '1', nome: 'CQI',          totalChecklists: 0, totalUsuarios: 14, avatares: 3 },
      { id: '2', nome: 'Produção',      totalChecklists: 2, totalUsuarios: 27, avatares: 3 },
      { id: '3', nome: 'Classificação', totalChecklists: 2, totalUsuarios: 33, avatares: 3 },
    ],
  },
}

const defaultGrupo = { nome: 'Grupo', subgrupos: [] }

export default function SubgruposPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [modal, setModal] = useState(false)
  const grupo = mockGrupos[id] ?? defaultGrupo

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-gray-700">
          <Link href="/gestao/grupos" className="text-gray-400 hover:text-orange-500 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <span className="font-semibold text-lg">{grupo.nome}</span>
          <span className="text-gray-400">/</span>
          <span className="text-gray-500">Áreas</span>
        </div>
        <Button onClick={() => setModal(true)}>
          <Plus size={16} />
          Criar nova área
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {grupo.subgrupos.map(sub => (
          <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">{sub.nome}</h2>
              <button className="text-gray-400 hover:text-gray-600 p-1">
                <MoreVertical size={16} />
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-2 rounded-lg flex-1">
                <FileText size={14} className="text-blue-400" />
                <span className="text-blue-500 font-bold text-sm">{sub.totalChecklists}</span>
                <span className="text-gray-500 text-xs">Checklists</span>
              </div>

              <div className="flex items-center gap-1.5 bg-green-50 px-3 py-2 rounded-lg flex-1">
                <Users size={14} className="text-green-400" />
                <span className="text-green-500 font-bold text-sm">{sub.totalUsuarios}</span>
                <span className="text-gray-500 text-xs">Usuários</span>
              </div>
            </div>

            {/* Avatares */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(sub.avatares, 3) }).map((_, i) => (
                <div key={i} className="w-7 h-7 rounded-full bg-gray-200 border-2 border-white -ml-1 first:ml-0 flex items-center justify-center">
                  <Users size={12} className="text-gray-400" />
                </div>
              ))}
              {sub.totalUsuarios > 3 && (
                <span className="text-xs text-gray-500 ml-1">+{sub.totalUsuarios - 3}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal && <NovoSubgrupoModal onClose={() => setModal(false)} />}
    </>
  )
}
