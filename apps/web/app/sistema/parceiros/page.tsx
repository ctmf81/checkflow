'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Handshake, Mail, ExternalLink, Send, Wallet, Check, QrCode, UserCheck, X, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'
import { ParceiroEditarModal, type ParceiroEditavel } from '@/components/modals/ParceiroEditarModal'
import { FormularioParceiroModal } from '@/components/modals/FormularioParceiroModal'
import type { ParceiroKyc } from '@/components/modals/ParceiroKycFields'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

interface EmpresaVinculada {
  id: string
  nome: string
  status: string
  plano: string | null
  valor_mensalidade: number | null
  parceiro_percentual: number | null
}

interface Parceiro extends Partial<ParceiroKyc> {
  id: string
  nome: string
  email: string
  telefone: string | null
  documento: string | null
  status: 'ativo' | 'inativo'
  email_boasvindas_enviado_em: string | null
  asaas_wallet_id: string | null
  empresas: EmpresaVinculada[]
}

interface PreCadastro extends Partial<ParceiroKyc> {
  id: string
  nome: string
  documento: string
  email: string
  telefone: string | null
  mensagem: string | null
  criado_em: string
}

function formatarDoc(digits: string | null) {
  if (!digits) return '—'
  if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  if (digits.length === 14) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
  return digits
}

function formatarMoeda(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ParceirosPage() {
  const router = useRouter()
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [reenviando, setReenviando] = useState<string | null>(null)
  const [avisoReenvio, setAvisoReenvio] = useState('')
  const [criandoConta, setCriandoConta] = useState<string | null>(null)
  const [editarModal, setEditarModal] = useState<Parceiro | null>(null)
  const [preCadastros, setPreCadastros] = useState<PreCadastro[]>([])
  const [moderando, setModerando] = useState<string | null>(null)
  const [formModal, setFormModal] = useState(false)

  async function aprovarPre(pc: PreCadastro) {
    setModerando(pc.id)
    setAvisoReenvio('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    // Carrega o KYC que o próprio interessado preencheu no formulário público.
    const { data: novo, error } = await supabase.from('parceiros').insert({
      nome: pc.nome, email: pc.email, telefone: pc.telefone, documento: pc.documento,
      data_nascimento: pc.data_nascimento ?? null, tipo_empresa: pc.tipo_empresa ?? null,
      cep: pc.cep ?? null, endereco: pc.endereco ?? null, endereco_numero: pc.endereco_numero ?? null,
      complemento: pc.complemento ?? null, bairro: pc.bairro ?? null,
      criado_por: user?.id ?? null,
    }).select('id, nome, email, telefone, documento, status, email_boasvindas_enviado_em, asaas_wallet_id, data_nascimento, tipo_empresa, renda_mensal, cep, endereco, endereco_numero, complemento, bairro').single()
    if (error || !novo) {
      setModerando(null)
      setAvisoReenvio(error?.code === '23505'
        ? `Já existe um parceiro com o CPF/CNPJ ou e-mail de ${pc.nome}.`
        : `Não foi possível aprovar ${pc.nome}. Tente novamente.`)
      return
    }
    await supabase.from('parceiro_pre_cadastros').update({
      status: 'aprovado', parceiro_id: novo.id, moderado_por: user?.id ?? null, moderado_em: new Date().toISOString(),
    }).eq('id', pc.id)
    setParceiros(prev => [{ ...(novo as Parceiro), empresas: [] }, ...prev])
    setPreCadastros(prev => prev.filter(x => x.id !== pc.id))
    setModerando(null)
  }

  async function rejeitarPre(pc: PreCadastro) {
    setModerando(pc.id)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('parceiro_pre_cadastros').update({
      status: 'rejeitado', moderado_por: user?.id ?? null, moderado_em: new Date().toISOString(),
    }).eq('id', pc.id)
    setPreCadastros(prev => prev.filter(x => x.id !== pc.id))
    setModerando(null)
  }

  async function criarContaAsaas(p: Parceiro) {
    setCriandoConta(p.id)
    setAvisoReenvio('')
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch(`${API_URL}/parceiros/${p.id}/conta-asaas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: '{}', // Fastify rejeita POST application/json com corpo vazio (400) antes do handler
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.walletId) {
        setParceiros(prev => prev.map(x => x.id === p.id ? { ...x, asaas_wallet_id: body.walletId } : x))
      } else {
        setAvisoReenvio(`Não foi possível criar a conta Asaas de ${p.nome}: ${body?.error ?? res.statusText}`)
      }
    } catch {
      setAvisoReenvio(`Falha ao criar a conta Asaas de ${p.nome}. Verifique a API.`)
    }
    setCriandoConta(null)
  }

  async function reenviarBoasVindas(p: Parceiro) {
    setReenviando(p.id)
    setAvisoReenvio('')
    try {
      const empresaId = p.empresas[0]?.id
      const res = await fetch(`${API_URL}/parceiros/boas-vindas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parceiroId: p.id, empresaId }),
      })
      if (res.ok) {
        setParceiros(prev => prev.map(x =>
          x.id === p.id ? { ...x, email_boasvindas_enviado_em: new Date().toISOString() } : x
        ))
      } else {
        const body = await res.json().catch(() => null)
        setAvisoReenvio(`Falha ao enviar boas-vindas para ${p.nome}: ${body?.error ?? res.statusText}`)
      }
    } catch {
      setAvisoReenvio(`Falha ao enviar boas-vindas para ${p.nome}. Verifique a API.`)
    }
    setReenviando(null)
  }

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: lista } = await supabase
        .from('parceiros')
        .select('id, nome, email, telefone, documento, status, email_boasvindas_enviado_em, asaas_wallet_id, data_nascimento, tipo_empresa, renda_mensal, cep, endereco, endereco_numero, complemento, bairro')
        .order('nome')

      if (lista) {
        const comEmpresas = await Promise.all(lista.map(async p => {
          const { data: fins } = await supabase
            .from('empresa_financeiro')
            .select('plano, valor_mensalidade, parceiro_percentual, empresa:empresa_id(id, nome, status)')
            .eq('parceiro_id', p.id)
          const empresas: EmpresaVinculada[] = (fins ?? []).map((f: any) => {
            const emp = Array.isArray(f.empresa) ? f.empresa[0] : f.empresa
            return {
              id: emp?.id, nome: emp?.nome ?? '—', status: emp?.status,
              plano: f.plano, valor_mensalidade: f.valor_mensalidade, parceiro_percentual: f.parceiro_percentual,
            }
          }).filter(e => e.id)
          return { ...p, empresas }
        }))
        setParceiros(comEmpresas)
      }

      const { data: pcs } = await supabase
        .from('parceiro_pre_cadastros')
        .select('id, nome, documento, email, telefone, mensagem, criado_em, data_nascimento, tipo_empresa, cep, endereco, endereco_numero, complemento, bairro')
        .eq('status', 'pendente')
        .order('criado_em', { ascending: false })
      setPreCadastros((pcs ?? []) as PreCadastro[])

      setLoading(false)
    }
    carregar()
  }, [])

  const filtrados = parceiros.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    p.email.toLowerCase().includes(busca.toLowerCase())
  )

  const cfg = getOnboardingConfig('sistema-parceiros')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Programa de parceiros</h1>
          <p className="hidden sm:block text-sm text-gray-500 mt-0.5">Parceiros que recebem comissão por indicação de empresas</p>
        </div>
        <button onClick={() => setFormModal(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-orange-200 text-orange-600 text-sm font-medium hover:bg-orange-50 transition-colors">
          <QrCode size={14} /> Formulário de captação
        </button>
      </div>

      {/* Pré-cadastros pendentes de validação */}
      {preCadastros.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCheck size={15} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-900">Interessados aguardando validação ({preCadastros.length})</h2>
          </div>
          <div className="space-y-2">
            {preCadastros.map(pc => (
              <div key={pc.id} className="bg-white rounded-lg border border-amber-100 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{pc.nome}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatarDoc(pc.documento)} · {pc.email}{pc.telefone ? ` · ${pc.telefone}` : ''}</p>
                  {pc.mensagem && <p className="text-xs text-gray-400 mt-1 italic">“{pc.mensagem}”</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => aprovarPre(pc)} disabled={moderando === pc.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 disabled:opacity-50">
                    <Check size={13} /> {moderando === pc.id ? '...' : 'Aprovar'}
                  </button>
                  <button onClick={() => rejeitarPre(pc)} disabled={moderando === pc.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
                    <X size={13} /> Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 w-72 bg-white" />
        </div>
        <span className="text-sm text-gray-500 ml-auto">{filtrados.length} parceiro{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      {avisoReenvio && (
        <div className="mb-4 text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2">{avisoReenvio}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-16 text-center">
          <Handshake size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum parceiro cadastrado.</p>
          <p className="text-xs text-gray-400 mt-1">Vincule um parceiro pela aba &quot;Parceiro&quot; de uma empresa.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtrados.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-800">{p.nome}</h3>
                    <Badge status={p.status === 'ativo' ? 'ativo' : 'inativo'} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                    <Mail size={12} />
                    {p.email}
                    {p.telefone && <span className="text-gray-300">•</span>}
                    {p.telefone}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 text-xs">
                  {p.email_boasvindas_enviado_em ? (
                    <span className="text-green-600">E-mail de boas-vindas enviado</span>
                  ) : (
                    <button
                      onClick={() => reenviarBoasVindas(p)}
                      disabled={reenviando === p.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-50"
                    >
                      <Send size={12} />
                      {reenviando === p.id ? 'Enviando...' : 'Enviar boas-vindas'}
                    </button>
                  )}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditarModal(p)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    {p.asaas_wallet_id ? (
                      <span className="inline-flex items-center gap-1 text-green-600" title={`walletId: ${p.asaas_wallet_id}`}>
                        <Check size={12} /> Conta Asaas ativa (split ligado)
                      </span>
                    ) : (
                      <button
                        onClick={() => criarContaAsaas(p)}
                        disabled={criandoConta === p.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <Wallet size={12} />
                        {criandoConta === p.id ? 'Criando...' : 'Criar conta Asaas'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {p.empresas.length === 0 ? (
                <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">Nenhuma empresa vinculada.</p>
              ) : (
                <div className="pt-2 border-t border-gray-100 divide-y divide-gray-50">
                  {p.empresas.map(e => {
                    const comissao = e.status === 'ativo' && e.valor_mensalidade != null && e.parceiro_percentual != null
                      ? (Number(e.valor_mensalidade) * Number(e.parceiro_percentual)) / 100
                      : null
                    return (
                      <div key={e.id} className="flex items-center justify-between py-2 text-sm">
                        <button
                          onClick={() => router.push(`/sistema/empresas/${e.id}`)}
                          className="flex items-center gap-1.5 text-gray-700 hover:text-orange-600 font-medium"
                        >
                          {e.nome}
                          <ExternalLink size={12} />
                        </button>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <Badge status={e.status as 'ativo' | 'inativo' | 'pendente' | 'bloqueada'} />
                          <span>{e.plano ?? '—'}</span>
                          <span>{formatarMoeda(e.valor_mensalidade)}</span>
                          <span>{e.parceiro_percentual != null ? `${e.parceiro_percentual}%` : '—'}</span>
                          <span className="font-medium text-gray-700">{formatarMoeda(comissao)}/mês</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editarModal && (
        <ParceiroEditarModal
          parceiro={editarModal as ParceiroEditavel}
          onClose={() => setEditarModal(null)}
          onSaved={(patch) => {
            setParceiros(prev => prev.map(x => x.id === editarModal.id ? { ...x, ...patch } : x))
            setEditarModal(null)
          }}
          onExcluido={(id) => {
            setParceiros(prev => prev.filter(x => x.id !== id))
            setEditarModal(null)
          }}
        />
      )}

      {formModal && <FormularioParceiroModal onClose={() => setFormModal(false)} />}
    </>
  )
}
