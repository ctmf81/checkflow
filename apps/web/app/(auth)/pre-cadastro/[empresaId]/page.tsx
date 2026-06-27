'use client'

import { use, useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { CheckFlowLogo } from '@/components/auth/CheckFlowLogo'
import { createClient } from '@/lib/supabase'

function formatCPF(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatTel(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export default function PreCadastroPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params)

  const [empresaNome, setEmpresaNome] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [empresaValida, setEmpresaValida] = useState<boolean | null>(null)

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [observacao, setObservacao] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient().rpc('empresa_publica', { p_id: empresaId })
        const e = Array.isArray(data) ? data[0] : data
        if (e?.nome) { setEmpresaNome(e.nome); setLogoUrl(e.logo_url ?? null); setEmpresaValida(true) }
        else setEmpresaValida(false)
      } catch {
        setEmpresaValida(false)
      }
    })()
  }, [empresaId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const cpfDigits = cpf.replace(/\D/g, '')
    const telDigits = telefone.replace(/\D/g, '')
    if (!nome.trim()) { setErro('Informe seu nome.'); return }
    if (cpfDigits.length !== 11) { setErro('CPF deve ter 11 dígitos.'); return }
    if (telDigits.length < 10) { setErro('Informe um telefone com DDD.'); return }

    setEnviando(true)
    const { error } = await createClient().from('pre_cadastros').insert({
      empresa_id: empresaId,
      nome: nome.trim(),
      cpf: cpfDigits,
      telefone: telDigits,
      email: email.trim() || null,
      observacao: observacao.trim() || null,
      status: 'pendente',
    })
    setEnviando(false)
    if (error) { setErro('Não foi possível enviar. Tente novamente.'); return }
    setEnviado(true)
  }

  if (empresaValida === false) return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <CheckFlowLogo />
      <p className="mt-6 text-sm text-gray-600">Link de pré-cadastro inválido ou indisponível.</p>
    </div>
  )

  if (enviado) return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={32} className="text-green-500" />
      </div>
      <h1 className="text-lg font-semibold text-gray-800">Pré-cadastro enviado!</h1>
      <p className="text-sm text-gray-500 mt-2">
        Recebemos seus dados. Quando um responsável aprovar, você receberá um código de acesso por WhatsApp{email.trim() ? ' (e e-mail)' : ''} para definir sua senha.
      </p>
    </div>
  )

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <div className="text-center mb-6">
        {logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logoUrl} alt="Logo" className="h-10 mx-auto object-contain mb-2" />
          : <CheckFlowLogo />}
        <h1 className="text-lg font-semibold text-gray-800 mt-3">Pré-cadastro</h1>
        {empresaNome && <p className="text-sm text-gray-500">{empresaNome}</p>}
        <p className="text-xs text-gray-400 mt-1">Preencha seus dados. Um responsável vai revisar e liberar seu acesso.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo *</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">CPF *</label>
          <input value={cpf} onChange={e => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Telefone (WhatsApp) *</label>
          <input value={telefone} onChange={e => setTelefone(formatTel(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">E-mail <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" type="email"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Setor / observação <span className="text-gray-400 font-normal">(opcional)</span></label>
          <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Ex: trabalho na unidade X, setor Y"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>

        {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

        <button type="submit" disabled={enviando}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
          {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
          Enviar pré-cadastro
        </button>
      </form>
    </div>
  )
}
