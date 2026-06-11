'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Handshake, Mail, ExternalLink, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'

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

interface Parceiro {
  id: string
  nome: string
  email: string
  telefone: string | null
  status: 'ativo' | 'inativo'
  email_boasvindas_enviado_em: string | null
  empresas: EmpresaVinculada[]
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
        .select('id, nome, email, telefone, status, email_boasvindas_enviado_em')
        .order('nome')

      if (lista) {
        const comEmpresas = await Promise.all(lista.map(async p => {
          const { data: empresas } = await supabase
            .from('empresas')
            .select('id, nome, status, plano, valor_mensalidade, parceiro_percentual')
            .eq('parceiro_id', p.id)
          return { ...p, empresas: empresas ?? [] }
        }))
        setParceiros(comEmpresas)
      }
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Programa de parceiros</h1>
          <p className="text-sm text-gray-500 mt-0.5">Parceiros que recebem comissão por indicação de empresas</p>
        </div>
      </div>

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
                <div className="text-right text-xs">
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
    </>
  )
}
