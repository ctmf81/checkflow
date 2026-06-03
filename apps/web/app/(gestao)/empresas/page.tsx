'use client'

import { useState } from 'react'
import { Plus, Building2, MoreVertical, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { NovaEmpresaModal } from './NovaEmpresaModal'

type StatusEmpresa = 'ativo' | 'inativo' | 'pendente' | 'bloqueada'

interface Empresa {
  id: string
  nome: string
  status: StatusEmpresa
  totalUnidades: number
  criadoEm: string
  criadoPor: string
}

const mock: Empresa[] = [
  { id: '1', nome: 'Empresa Modelo', status: 'ativo', totalUnidades: 1, criadoEm: '07/04/2026 - 11:58:21', criadoPor: 'Claudio Moura' },
  { id: '2', nome: 'Amadê',          status: 'ativo', totalUnidades: 3, criadoEm: '07/04/2026 - 11:52:31', criadoPor: 'Claudio Moura' },
  { id: '3', nome: 'Kualy',          status: 'ativo', totalUnidades: 1, criadoEm: '07/04/2026 - 10:39:41', criadoPor: 'Claudio Moura' },
]

export default function EmpresasPage() {
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)

  const empresas = mock.filter(e => e.nome.toLowerCase().includes(busca.toLowerCase()))

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-500 text-sm">Boa tarde, <span className="font-medium text-gray-800">Claudio</span> 👋</p>
        <Button onClick={() => setModal(true)}>
          <Plus size={16} />
          Nova empresa
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {/* Cabeçalho da listagem */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Building2 size={20} className="text-blue-500" />
          <span className="font-semibold text-gray-800">Empresas</span>
          <div className="relative ml-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="busque pelo nome da empresa"
              className="pl-8 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 w-64"
            />
          </div>
        </div>

        {/* Lista */}
        {empresas.map(empresa => (
          <div key={empresa.id} className="flex items-center justify-between px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
            <div className="flex-1">
              <p className="font-medium text-gray-800 mb-2">{empresa.nome}</p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-md">
                  <Building2 size={14} className="text-blue-500" />
                  <span className="text-blue-600 font-semibold text-sm">{empresa.totalUnidades}</span>
                  <span className="text-gray-500 text-xs">Unidades</span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>Criado em: {empresa.criadoEm}</p>
                  <p>Criado por: {empresa.criadoPor}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Badge status={empresa.status} />
              <button className="text-gray-400 hover:text-gray-600 p-1">
                <MoreVertical size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && <NovaEmpresaModal onClose={() => setModal(false)} />}
    </>
  )
}
