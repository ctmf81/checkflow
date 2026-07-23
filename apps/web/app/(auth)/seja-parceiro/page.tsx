'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Handshake } from 'lucide-react'
import { CheckFlowLogo } from '@/components/auth/CheckFlowLogo'
import { createClient } from '@/lib/supabase'

function formatDoc(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function formatTel(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export default function SejaParceiroPage() {
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [mensagem, setMensagem] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const docDigits = documento.replace(/\D/g, '')
    const telDigits = telefone.replace(/\D/g, '')
    if (!nome.trim()) { setErro('Informe seu nome.'); return }
    if (docDigits.length !== 11 && docDigits.length !== 14) { setErro('Informe um CPF (11) ou CNPJ (14 dígitos).'); return }
    if (!email.trim()) { setErro('Informe um e-mail.'); return }
    if (telDigits && telDigits.length < 10) { setErro('Telefone inválido — informe com DDD.'); return }

    setEnviando(true)
    const { error } = await createClient().from('parceiro_pre_cadastros').insert({
      nome: nome.trim(),
      documento: docDigits,
      email: email.trim().toLowerCase(),
      telefone: telDigits || null,
      mensagem: mensagem.trim() || null,
      status: 'pendente',
    })
    setEnviando(false)
    if (error) { setErro('Não foi possível enviar. Tente novamente.'); return }
    setEnviado(true)
  }

  if (enviado) return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={32} className="text-green-500" />
      </div>
      <h1 className="text-lg font-semibold text-gray-800">Cadastro enviado!</h1>
      <p className="text-sm text-gray-500 mt-2">
        Recebemos seu interesse em ser parceiro CheckFlow. Nossa equipe vai analisar e entrar em contato pelo e-mail{telefone.trim() ? ' ou WhatsApp' : ''} informado.
      </p>
    </div>
  )

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <div className="text-center mb-6">
        <CheckFlowLogo />
        <div className="flex items-center justify-center gap-2 mt-3">
          <Handshake size={18} className="text-orange-500" />
          <h1 className="text-lg font-semibold text-gray-800">Seja um parceiro</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1">Indique empresas e receba comissão. Preencha seus dados — nossa equipe analisa e entra em contato.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo *</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">CPF ou CNPJ *</label>
          <input value={documento} onChange={e => setDocumento(formatDoc(e.target.value))} placeholder="000.000.000-00" inputMode="numeric"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">E-mail *</label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" type="email"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Telefone (WhatsApp) <span className="text-gray-400 font-normal">(recomendado)</span></label>
          <input value={telefone} onChange={e => setTelefone(formatTel(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mensagem <span className="text-gray-400 font-normal">(opcional)</span></label>
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={2} placeholder="Conte como pretende indicar empresas"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>

        {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

        <button type="submit" disabled={enviando}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
          {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
          Enviar cadastro
        </button>
      </form>
    </div>
  )
}
