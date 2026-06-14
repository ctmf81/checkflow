'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ExternalLink, UserPlus, AlertTriangle, Trash2, Handshake, X, HardDrive, ClipboardCheck, Cpu } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { UsuarioModal } from '@/app/gestao/acessos/usuarios/UsuarioModal'
import { ExcluirEmpresaModal } from './ExcluirEmpresaModal'
import { ParceiroModal, ParceiroSelecionado } from '@/components/modals/ParceiroModal'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'

type Aba = 'administrador' | 'pagamento' | 'parceiro' | 'configuracoes' | 'uso'

const ORIGEM_LABEL: Record<string, string> = {
  execucao: 'Fotos/vídeos de execuções',
  ticket: 'Evidências de tickets',
  pdf: 'Relatórios PDF',
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const k = 1024
  const tamanhos = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${tamanhos[i]}`
}

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
  const [erroParceiro, setErroParceiro] = useState('')
  // Parceiro recém-cadastrado: boas-vindas só dispara DEPOIS do vínculo ser salvo
  const [parceiroNovoPendente, setParceiroNovoPendente] = useState(false)
  const [erroPag, setErroPag] = useState('')
  const [erroConfig, setErroConfig] = useState('')

  // Config
  const [nomeEmp, setNomeEmp] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [statusEmp, setStatusEmp] = useState('')

  // Admin
  const [adminId, setAdminId] = useState('')
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string; email: string }[]>([])

  // Uso
  const [usoArmazenamento, setUsoArmazenamento] = useState<{ origem: string; bytes: number }[]>([])
  const [totalArmazenamento, setTotalArmazenamento] = useState(0)
  const [totalChecklists, setTotalChecklists] = useState(0)
  const [usoIA, setUsoIA] = useState<{ provedor: string; tokensIn: number; tokensOut: number }[]>([])
  const [loadingUso, setLoadingUso] = useState(false)
  const [usoCarregado, setUsoCarregado] = useState(false)

  async function carregarUso() {
    setLoadingUso(true)
    const supabase = createClient()

    const [{ data: arm }, { data: unidadesEmp }, { data: ia }] = await Promise.all([
      supabase.from('uso_armazenamento').select('origem, tamanho_bytes').eq('empresa_id', id),
      supabase.from('unidades').select('id').eq('empresa_id', id),
      supabase.from('uso_ia_eventos').select('provedor, tokens_entrada, tokens_saida').eq('empresa_id', id),
    ])

    const porOrigem = new Map<string, number>()
    let totalBytes = 0
    for (const r of arm ?? []) {
      totalBytes += r.tamanho_bytes
      porOrigem.set(r.origem, (porOrigem.get(r.origem) ?? 0) + r.tamanho_bytes)
    }

    const unidadeIds = (unidadesEmp ?? []).map(u => u.id)
    let totalExec = 0
    if (unidadeIds.length) {
      const { count } = await supabase.from('checklist_execucoes').select('id', { count: 'exact', head: true }).in('unidade_id', unidadeIds)
      totalExec = count ?? 0
    }

    const porProvedor = new Map<string, { tokensIn: number; tokensOut: number }>()
    for (const r of ia ?? []) {
      const cur = porProvedor.get(r.provedor) ?? { tokensIn: 0, tokensOut: 0 }
      cur.tokensIn += r.tokens_entrada
      cur.tokensOut += r.tokens_saida
      porProvedor.set(r.provedor, cur)
    }

    setUsoArmazenamento([...porOrigem].map(([origem, bytes]) => ({ origem, bytes })))
    setTotalArmazenamento(totalBytes)
    setTotalChecklists(totalExec)
    setUsoIA([...porProvedor].map(([provedor, t]) => ({ provedor, ...t })))
    setLoadingUso(false)
    setUsoCarregado(true)
  }

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
        .select('id, nome, cnpj, status, logo_url, criado_em, empresa_financeiro(plano, valor_mensalidade, pagamento_vencimento, status_pagamento, parceiro_percentual, parceiros(id, nome, email))')
        .eq('id', id)
        .single()
      if (emp) {
        const fin: any = Array.isArray(emp.empresa_financeiro) ? emp.empresa_financeiro[0] : emp.empresa_financeiro
        setEmpresa(emp)
        setNomeEmp(emp.nome)
        setCnpj(emp.cnpj ?? '')
        setStatusEmp(emp.status)
        setPlano(fin?.plano ?? '')
        setValor(fin?.valor_mensalidade != null ? String(fin.valor_mensalidade) : '')
        setVencimento(fin?.pagamento_vencimento ?? '')
        setStatusPag(fin?.status_pagamento ?? '')
        setPercentual(fin?.parceiro_percentual != null ? String(fin.parceiro_percentual) : '')
        const parc = fin?.parceiros ? (Array.isArray(fin.parceiros) ? fin.parceiros[0] : fin.parceiros) : null
        if (parc) setParceiroAtual(parc)
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
    setErroConfig('')
    const supabase = createClient()
    const { error } = await supabase.from('empresas').update({
      nome: nomeEmp, cnpj, status: statusEmp,
      atualizado_em: new Date().toISOString()
    }).eq('id', id)
    setSalvando(false)
    if (error) setErroConfig(`Erro ao salvar: ${error.message}`)
  }

  // Aceita "1.234,56", "1234,56" e "1234.56" — retorna null se inválido
  function parseValorBR(v: string): number | null {
    const limpo = v.trim()
    if (!limpo) return null
    const normalizado = limpo.includes(',')
      ? limpo.replace(/\./g, '').replace(',', '.')
      : limpo
    const n = Number(normalizado)
    return Number.isFinite(n) ? n : NaN
  }

  async function salvarPagamento() {
    setErroPag('')
    const valorNum = parseValorBR(valor)
    if (valorNum !== null && Number.isNaN(valorNum)) {
      setErroPag('Valor inválido. Use o formato 1234,56.')
      return
    }
    setSalvandoPag(true)
    const supabase = createClient()
    const { error } = await supabase.from('empresa_financeiro').upsert({
      empresa_id: id,
      plano: plano || null,
      valor_mensalidade: valorNum,
      pagamento_vencimento: vencimento || null,
      status_pagamento: statusPag || 'pendente',
      atualizado_em: new Date().toISOString()
    }, { onConflict: 'empresa_id' })
    setSalvandoPag(false)
    if (error) setErroPag(`Erro ao salvar: ${error.message}`)
  }

  async function salvarParceiro() {
    setMensagemParceiro('')
    setErroParceiro('')

    const pctNum = parseValorBR(percentual)
    if (parceiroAtual && pctNum !== null && (Number.isNaN(pctNum) || pctNum < 0 || pctNum > 100)) {
      setErroParceiro('Percentual inválido — informe um número entre 0 e 100.')
      return
    }

    setSalvandoParceiro(true)
    const supabase = createClient()
    const { error } = await supabase.from('empresa_financeiro').upsert({
      empresa_id: id,
      parceiro_id: parceiroAtual?.id ?? null,
      // Sem parceiro não existe percentual — evita percentual órfão no banco
      parceiro_percentual: parceiroAtual ? pctNum : null,
      atualizado_em: new Date().toISOString()
    }, { onConflict: 'empresa_id' })

    if (error) {
      setSalvandoParceiro(false)
      setErroParceiro(`Erro ao salvar: ${error.message}`)
      return
    }

    // Boas-vindas: só depois do vínculo estar de fato salvo no banco
    if (parceiroAtual && parceiroNovoPendente) {
      try {
        const res = await fetch(`${API_URL}/parceiros/boas-vindas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parceiroId: parceiroAtual.id, empresaId: id }),
        })
        if (res.ok) {
          setParceiroNovoPendente(false)
          setMensagemParceiro('Parceiro salvo e e-mail de boas-vindas enviado.')
        } else {
          setMensagemParceiro('Parceiro salvo, mas o e-mail de boas-vindas falhou — reenvie pela tela Parceiros.')
        }
      } catch {
        setMensagemParceiro('Parceiro salvo, mas o e-mail de boas-vindas falhou — reenvie pela tela Parceiros.')
      }
    } else {
      setMensagemParceiro('Parceiro salvo com sucesso.')
    }
    setSalvandoParceiro(false)
  }

  function onParceiroSelecionado(parceiro: ParceiroSelecionado) {
    setParceiroAtual({ id: parceiro.id, nome: parceiro.nome, email: parceiro.email })
    setParceiroNovoPendente(parceiro.novo)
    setModalParceiro(false)
  }

  const abas: { key: Aba; label: string }[] = [
    { key: 'administrador', label: 'Administrador' },
    { key: 'pagamento',     label: 'Pagamento' },
    { key: 'parceiro',      label: 'Parceiro' },
    { key: 'configuracoes', label: 'Configurações' },
    { key: 'uso',           label: 'Uso' },
  ]

  function trocarAba(a: Aba) {
    setAba(a)
    if (a === 'uso' && !usoCarregado) carregarUso()
  }

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
          <button key={a.key} onClick={() => trocarAba(a.key)}
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
            {erroPag && (
              <div className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2">{erroPag}</div>
            )}
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
            {erroParceiro && (
              <div className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2">{erroParceiro}</div>
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
            {erroConfig && (
              <div className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2">{erroConfig}</div>
            )}
            <div className="flex justify-end pt-2">
              <Button onClick={salvarConfig} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar configurações'}
              </Button>
            </div>
          </div>
        )}

        {aba === 'uso' && (
          <div className="space-y-5">
            <h2 className="font-semibold text-gray-700">Indicadores de uso</h2>

            {loadingUso ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
              <>
                {/* Armazenamento */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive size={16} className="text-orange-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Armazenamento</h3>
                    <span className="ml-auto text-sm font-bold text-gray-800">{formatBytes(totalArmazenamento)}</span>
                  </div>
                  {usoArmazenamento.length === 0 ? (
                    <p className="text-xs text-gray-400">Nenhum upload registrado ainda.</p>
                  ) : (
                    <ul className="space-y-1">
                      {usoArmazenamento.map(u => (
                        <li key={u.origem} className="flex items-center justify-between text-xs text-gray-500">
                          <span>{ORIGEM_LABEL[u.origem] ?? u.origem}</span>
                          <span className="font-medium text-gray-700">{formatBytes(u.bytes)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Checklists executados */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck size={16} className="text-orange-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Checklists executados</h3>
                    <span className="ml-auto text-sm font-bold text-gray-800">{totalChecklists}</span>
                  </div>
                </div>

                {/* IA */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu size={16} className="text-orange-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Consulta Inteligente (tokens de IA)</h3>
                  </div>
                  {usoIA.length === 0 ? (
                    <p className="text-xs text-gray-400">Nenhum uso de IA registrado ainda.</p>
                  ) : (
                    <ul className="space-y-1">
                      {usoIA.map(u => (
                        <li key={u.provedor} className="flex items-center justify-between text-xs text-gray-500">
                          <span className="capitalize">{u.provedor}</span>
                          <span className="font-medium text-gray-700">
                            {(u.tokensIn + u.tokensOut).toLocaleString('pt-BR')} tokens
                            <span className="text-gray-400"> ({u.tokensIn.toLocaleString('pt-BR')} entrada / {u.tokensOut.toLocaleString('pt-BR')} saída)</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
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
