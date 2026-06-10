'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Building2, Users, ExternalLink, Settings, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { NovaEmpresaModal } from '@/components/modals/NovaEmpresaModal'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

type StatusEmpresa = 'ativo' | 'inativo' | 'pendente' | 'bloqueada'

interface EmpresaCard {
  id: string
  nome: string
  cnpj: string | null
  status: StatusEmpresa
  criado_em: string
  totalUnidades: number
  totalUsuarios: number
}

const STATUS_FILTROS = ['todos', 'ativo', 'inativo', 'pendente', 'bloqueada'] as const

export default function SistemaPage() {
  const router = useRouter()
  const { setEmpresaAtiva, setAmbiente } = useSession()
  const [empresas, setEmpresas] = useState<EmpresaCard[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data } = await supabase.from('empresas').select('id, nome, cnpj, status, criado_em').order('nome')
      if (data) {
        const comContagens = await Promise.all(data.map(async e => {
          const { count: unis } = await supabase.from('unidades').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id)
          const { count: users } = await supabase.from('usuario_empresa').select('usuario_id', { count: 'exact', head: true }).eq('empresa_id', e.id)
          return { ...e, totalUnidades: unis ?? 0, totalUsuarios: users ?? 0 }
        }))
        setEmpresas(comContagens)
      }
      setLoading(false)
    }
    carregar()
  }, [])

  async function acessarEmpresa(empresa: EmpresaCard) {
    await setEmpresaAtiva({ id: empresa.id, nome: empresa.nome })
    setAmbiente('gestao')
    router.push('/gestao/empresas')
  }

  const filtradas = empresas.filter(e => {
    const matchBusca = e.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (e.cnpj ?? '').includes(busca)
    const matchStatus = filtroStatus === 'todos' || e.status === filtroStatus
    return matchBusca && matchStatus
  })

  const cfg = getOnboardingConfig('sistema-empresas')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Painel de sistema</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestão global de empresas na plataforma</p>
        </div>
        <Button onClick={() => setModal(true)}>
          <Plus size={16} />
          Nova empresa
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar empresa ou CNPJ"
            className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 w-64 bg-white" />
        </div>

        <div className="flex gap-2">
          {STATUS_FILTROS.map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filtroStatus === s ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {s === 'todos' ? 'Todos' : s}
            </button>
          ))}
        </div>

        <span className="text-sm text-gray-500 ml-auto">{filtradas.length} empresa{filtradas.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : filtradas.length === 0 ? (
        <div className="py-16 text-center">
          <Building2 size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhuma empresa encontrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtradas.map(empresa => (
            <div key={empresa.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
              {/* Header do card */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{empresa.nome}</h3>
                  {empresa.cnpj && <p className="text-xs text-gray-400 mt-0.5">{empresa.cnpj}</p>}
                </div>
                <Badge status={empresa.status} />
              </div>

              {/* Contadores */}
              <div className="flex gap-3 mb-4">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Building2 size={13} className="text-blue-400" />
                  <span className="font-medium text-gray-700">{empresa.totalUnidades}</span> unidades
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users size={13} className="text-green-400" />
                  <span className="font-medium text-gray-700">{empresa.totalUsuarios}</span> usuários
                </div>
                <div className="text-xs text-gray-400 ml-auto">
                  {new Date(empresa.criado_em).toLocaleDateString('pt-BR')}
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => acessarEmpresa(empresa)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                >
                  <ExternalLink size={13} />
                  Acessar empresa
                </button>
                <button
                  onClick={() => router.push(`/sistema/empresas/${empresa.id}`)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <Settings size={13} />
                  Detalhes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <NovaEmpresaModal
          onClose={() => setModal(false)}
          onCriada={() => {
            setModal(false)
            // Recarrega a lista
            setLoading(true)
            const supabase = createClient()
            supabase.from('empresas').select('id, nome, cnpj, status, criado_em').order('nome')
              .then(async ({ data }) => {
                if (data) {
                  const comContagens = await Promise.all(data.map(async e => {
                    const { count: unis } = await supabase.from('unidades').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id)
                    const { count: users } = await supabase.from('usuario_empresa').select('usuario_id', { count: 'exact', head: true }).eq('empresa_id', e.id)
                    return { ...e, totalUnidades: unis ?? 0, totalUsuarios: users ?? 0 }
                  }))
                  setEmpresas(comContagens)
                }
                setLoading(false)
              })
          }}
        />
      )}
    </>
  )
}
