'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ExternalLink, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { UsuarioModal } from '@/app/gestao/acessos/usuarios/UsuarioModal'

type Aba = 'administrador' | 'pagamento' | 'configuracoes'

interface Empresa {
  id: string
  nome: string
  cnpj: string | null
  status: 'ativo' | 'inativo' | 'pendente' | 'bloqueada'
  logo_url: string | null
  criado_em: string
}

interface Usuario {
  id: string
  nome: string
  email: string
  cpf: string
  telefone: string
  perfil: string
  unidades: { id: string; nome: string }[]
}

export default function EmpresaDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { setEmpresaAtiva, setAmbiente } = useSession()
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [aba, setAba] = useState<Aba>('administrador')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [modalUsuario, setModalUsuario] = useState(false)

  // Pagamento
  const [plano, setPlano] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [statusPag, setStatusPag] = useState('')

  // Config
  const [nomeEmp, setNomeEmp] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [statusEmp, setStatusEmp] = useState('')

  // Admin
  const [adminId, setAdminId] = useState('')
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string; email: string }[]>([])

  async function carregarUsuarios() {
    const supabase = createClient()
    const { data } = await supabase.from('usuarios').select('id, nome, email').order('nome')
    if (data) setUsuarios(data)
  }

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: emp } = await supabase.from('empresas').select('*').eq('id', id).single()
      if (emp) {
        setEmpresa(emp)
        setNomeEmp(emp.nome)
        setCnpj(emp.cnpj ?? '')
        setStatusEmp(emp.status)
      }
      await carregarUsuarios()
      setLoading(false)
    }
    carregar()
  }, [id])

  async function acessarEmpresa() {
    if (!empresa) return
    await setEmpresaAtiva({ id: empresa.id, nome: empresa.nome })
    setAmbiente('gestao')
    router.push('/gestao')
  }

  async function salvarConfig() {
    setSalvando(true)
    const supabase = createClient()
    await supabase.from('empresas').update({
      nome: nomeEmp, cnpj, status: statusEmp,
      atualizado_em: new Date().toISOString()
    }).eq('id', id)
    setSalvando(false)
  }

  const abas: { key: Aba; label: string }[] = [
    { key: 'administrador', label: 'Administrador' },
    { key: 'pagamento',     label: 'Pagamento' },
    { key: 'configuracoes', label: 'Configurações' },
  ]

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
  if (!empresa) return <div className="py-16 text-center text-sm text-gray-500">Empresa não encontrada.</div>

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/sistema')} className="text-gray-400 hover:text-orange-500 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-800">{empresa.nome}</h1>
              <Badge status={empresa.status} />
            </div>
            {empresa.cnpj && <p className="text-xs text-gray-400">{empresa.cnpj}</p>}
          </div>
        </div>
        <Button onClick={acessarEmpresa}>
          <ExternalLink size={15} />
          Acessar empresa
        </Button>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {abas.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              aba === a.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-xl">

        {aba === 'administrador' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-700">Administrador da empresa</h2>
            <p className="text-sm text-gray-500">Selecione o usuário que será o administrador desta empresa.</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuário administrador</label>
              <select value={adminId} onChange={e => setAdminId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Selecione um usuário</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome} — {u.email}</option>
                ))}
              </select>
            </div>

            {/* Cadastrar novo usuário */}
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 border-t border-gray-100" />
              <span className="text-xs text-gray-400">ou</span>
              <div className="flex-1 border-t border-gray-100" />
            </div>

            <button
              onClick={() => setModalUsuario(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border-2 border-dashed border-gray-200 rounded-lg text-gray-500 hover:border-orange-300 hover:text-orange-500 transition-colors"
            >
              <UserPlus size={16} />
              Cadastrar novo usuário
            </button>

            <div className="flex justify-end pt-2">
              <Button disabled={!adminId}>Salvar administrador</Button>
            </div>
          </div>
        )}

        {aba === 'pagamento' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-700 mb-4">Dados de pagamento</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
                <select value={plano} onChange={e => setPlano(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                  <option value="">Selecione</option>
                  <option value="validacao">Validação (~US$ 10/mês)</option>
                  <option value="tracao">Tração (~US$ 60/mês)</option>
                  <option value="escala">Escala (US$ 300+/mês)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={statusPag} onChange={e => setStatusPag(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                  <option value="">Selecione</option>
                  <option value="em_dia">Em dia</option>
                  <option value="pendente">Pendente</option>
                  <option value="inadimplente">Inadimplente</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                <input value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button>Salvar pagamento</Button>
            </div>
          </div>
        )}

        {aba === 'configuracoes' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-700 mb-4">Configurações da empresa</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
              <input value={nomeEmp} onChange={e => setNomeEmp(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
              <input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={statusEmp} onChange={e => setStatusEmp(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="pendente">Pendente</option>
                <option value="bloqueada">Bloqueada</option>
              </select>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={salvarConfig} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar configurações'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de cadastro de novo usuário */}
      {modalUsuario && (
        <UsuarioModal
          onClose={() => {
            setModalUsuario(false)
            carregarUsuarios() // recarrega lista após cadastro
          }}
        />
      )}
    </>
  )
}
