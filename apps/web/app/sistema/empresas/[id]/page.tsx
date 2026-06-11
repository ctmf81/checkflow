'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ExternalLink, UserPlus, AlertTriangle, Trash2, Handshake, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { UsuarioModal } from '@/app/gestao/acessos/usuarios/UsuarioModal'
import { ExcluirEmpresaModal } from './ExcluirEmpresaModal'
import { ParceiroModal, ParceiroSelecionado } from '@/components/modals/ParceiroModal'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'

type Aba = 'administrador' | 'pagamento' | 'parceiro' | 'configuracoes'

interface Empresa {
  id: string
  nome: string
  cnpj: string | null
  status: 'ativo' | 'inativo' | 'pendente' | 'bloqueada'
  logo_url: string | null
  criado_em: string
  plano: string | null
  valor_mensalidade: number | null
  status_pagamento: string | null
  pagamento_vencimento: string | null
  parceiro_id: string | null
  parceiro_percentual: number | null
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
  const [modalExcluir, setModalExcluir] = useState(false)

  // Pagamento
  const [plano, setPlano] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [statusPag, setStatusPag] = useState('')
  const [salvandoPag, setSalvandoPag] = useState(false)

  // Parceiro
  const [parceiroAtual, setParceiroAtual] = useState<{ id: string; nome: string; email: string } | null>(null)
  const [percentual, setPercentual] = useState('')
  const [modalParceiro, setModalParceiro] = useState(false)
  const [salvandoParceiro, setSalvandoParceiro] = useState(false)
  const [mensagemParceiro, setMensagemParceiro] = useState('')

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
      const { data: emp } = await supabase
        .from('empresas')
        .select('*, parceiros(id, nome, email)')
        .eq('id', id)
        .single()
      if (emp) {
        setEmpresa(emp)
        setNomeEmp(emp.nome)
        setCnpj(emp.cnpj ?? '')
        setStatusEmp(emp.status)
        setPlano(emp.plano ?? '')
        setValor(emp.valor_mensalidade != null ? String(emp.valor_mensalidade) : '')
        setVencimento(emp.pagamento_vencimento ?? '')
        setStatusPag(emp.status_pagamento ?? '')
        setPercentual(emp.parceiro_percentual != null ? String(emp.parceiro_percentual) : '')
        if (emp.parceiros) setParceiroAtual(emp.parceiros)
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

  async function salvarPagamento() {
    setSalvandoPag(true)
    const supabase = createClient()
    await supabase.from('empresas').update({
      plano: plano || null,
      valor_mensalidade: valor ? Number(valor.replace(',', '.')) : null,
      pagamento_vencimento: vencimento || null,
      status_pagamento: statusPag || 'pendente',
      atualizado_em: new Date().toISOString()
    }).eq('id', id)
    setSalvandoPag(false)
  }

  async function salvarParceiro() {
    setSalvandoParceiro(true)
    setMensagemParceiro('')
    const supabase = createClient()
    await supabase.from('empresas').update({
      parceiro_id: parceiroAtual?.id ?? null,
      parceiro_percentual: percentual ? Number(percentual.replace(',', '.')) : null,
      atualizado_em: new Date().toISOString()
    }).eq('id', id)
    setSalvandoParceiro(false)
    setMensagemParceiro('Parceiro salvo com sucesso.')
  }

  function onParceiroSelecionado(parceiro: ParceiroSelecionado) {
    setParceiroAtual({ id: parceiro.id, nome: parceiro.nome, email: parceiro.email })
    setModalParceiro(false)
    if (parceiro.novo) {
      fetch(`${API_URL}/parceiros/boas-vindas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parceiroId: parceiro.id, empresaId: id }),
      }).catch(() => {})
    }
  }

  const abas: { key: Aba; label: string }[] = [
    { key: 'administrador', label: 'Administrador' },
    { key: 'pagamento',     label: 'Pagamento' },
    { key: 'parceiro',      label: 'Parceiro' },
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
              <Button onClick={salvarPagamento} disabled={salvandoPag}>
                {salvandoPag ? 'Salvando...' : 'Salvar pagamento'}
              </Button>
            </div>
          </div>
        )}

        {aba === 'parceiro' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-700 mb-1">Programa de parceiros</h2>
            <p className="text-sm text-gray-500">
              O parceiro indicado recebe um percentual da mensalidade desta empresa enquanto
              houver contrato ativo.
            </p>

            {parceiroAtual ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{parceiroAtual.nome}</p>
                  <p className="text-xs text-gray-500 truncate">{parceiroAtual.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setModalParceiro(true)}>Trocar</Button>
                  <button
                    onClick={() => setParceiroAtual(null)}
                    className="text-gray-400 hover:text-red-500"
                    title="Remover parceiro"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setModalParceiro(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border-2 border-dashed border-gray-200 rounded-lg text-gray-500 hover:border-orange-300 hover:text-orange-500 transition-colors"
              >
                <Handshake size={16} />
                Vincular parceiro
              </button>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Percentual sobre a mensalidade (%)</label>
              <input value={percentual} onChange={e => setPercentual(e.target.value)} placeholder="0,00"
                disabled={!parceiroAtual}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50" />
            </div>

            {mensagemParceiro && (
              <div className="text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2">{mensagemParceiro}</div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={salvarParceiro} disabled={salvandoParceiro}>
                {salvandoParceiro ? 'Salvando...' : 'Salvar'}
              </Button>
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

      {/* Zona de perigo — exclusão definitiva, somente para empresas inativas */}
      {aba === 'configuracoes' && empresa.status === 'inativo' && (
        <div className="max-w-xl mt-6 bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-700">Zona de perigo</h3>
              <p className="text-xs text-red-600 mt-1">
                Excluir esta empresa apaga <strong>permanentemente</strong> todas as unidades, grupos,
                usuários vinculados, checklists, execuções, planos de ação, tickets e workflows
                relacionados. Essa ação não pode ser desfeita.
              </p>
              <Button
                onClick={() => setModalExcluir(true)}
                className="!bg-red-600 hover:!bg-red-700 mt-3"
              >
                <Trash2 size={15} />
                Excluir empresa permanentemente
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cadastro de novo usuário — restrito ao perfil Admin da empresa */}
      {modalUsuario && (
        <UsuarioModal
          perfilFixo="Admin da empresa"
          onClose={() => {
            setModalUsuario(false)
            carregarUsuarios()
          }}
        />
      )}

      {/* Modal de vínculo de parceiro */}
      {modalParceiro && (
        <ParceiroModal
          onClose={() => setModalParceiro(false)}
          onSelecionado={onParceiroSelecionado}
        />
      )}

      {/* Modal de exclusão definitiva da empresa */}
      {modalExcluir && (
        <ExcluirEmpresaModal
          empresaId={empresa.id}
          empresaNome={empresa.nome}
          onClose={() => setModalExcluir(false)}
          onExcluida={() => router.push('/sistema')}
        />
      )}
    </>
  )
}
