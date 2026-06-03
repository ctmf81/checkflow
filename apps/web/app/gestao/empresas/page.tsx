'use client'

import { useEffect, useState } from 'react'
import { Plus, Building2, MoreVertical, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { NovaEmpresaModal } from './NovaEmpresaModal'
import { createClient } from '@/lib/supabase'

type StatusEmpresa = 'ativo' | 'inativo' | 'pendente' | 'bloqueada'

interface Empresa {
  id: string
  nome: string
  status: StatusEmpresa
  criado_em: string
  totalUnidades: number
}

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('empresas').select('id, nome, status, criado_em').order('nome')
    if (data) {
      const comUnidades = await Promise.all(data.map(async e => {
        const { count } = await supabase.from('unidades').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id)
        return { ...e, totalUnidades: count ?? 0 }
      }))
      setEmpresas(comUnidades)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const filtradas = empresas.filter(e => e.nome.toLowerCase().includes(busca.toLowerCase()))

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">Bem-vindo ao <span className="font-medium text-gray-800">CheckFlow</span></p>
        <Button onClick={() => setModal(true)}><Plus size={16} />Nova empresa</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Building2 size={20} className="text-blue-500" />
          <span className="font-semibold text-gray-800">Empresas</span>
          <div className="relative ml-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="busque pelo nome da empresa"
              className="pl-8 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 w-64" />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nenhuma empresa cadastrada.</p>
            <p className="text-xs text-gray-400 mt-1">Clique em &quot;Nova empresa&quot; para começar.</p>
          </div>
        ) : filtradas.map(empresa => (
          <div key={empresa.id} className="flex items-center justify-between px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
            <div className="flex-1">
              <p className="font-medium text-gray-800 mb-2">{empresa.nome}</p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-md">
                  <Building2 size={14} className="text-blue-500" />
                  <span className="text-blue-600 font-semibold text-sm">{empresa.totalUnidades}</span>
                  <span className="text-gray-500 text-xs">Unidades</span>
                </div>
                <p className="text-xs text-gray-500">Criado em: {new Date(empresa.criado_em).toLocaleString('pt-BR')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge status={empresa.status} />
              <button className="text-gray-400 hover:text-gray-600 p-1"><MoreVertical size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      {modal && <NovaEmpresaModal onClose={() => { setModal(false); carregar() }} />}
    </>
  )
}
