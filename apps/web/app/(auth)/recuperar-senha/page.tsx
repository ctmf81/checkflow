'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CheckFlowLogo } from '@/components/auth/CheckFlowLogo'

function formatCPF(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export default function RecuperarSenhaPage() {
  const router = useRouter()
  const [etapa, setEtapa] = useState<'cpf' | 'codigo'>('cpf')
  const [cpf, setCpf] = useState('')
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')

  async function handleSolicitar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/solicitar-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErro(json.message ?? 'Não foi possível enviar o código.')
        setLoading(false)
        return
      }
      setInfo(json.message ?? 'Código enviado.')
      setEtapa('codigo')
    } catch (e: any) {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerificar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verificar-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, codigo }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErro(json.message ?? 'Código inválido.')
        setLoading(false)
        return
      }
      sessionStorage.setItem('checkflow_reset_cpf', cpf.replace(/\D/g, ''))
      sessionStorage.setItem('checkflow_reset_token', json.token)
      router.push('/nova-senha')
    } catch (e: any) {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm px-8 py-10">
      <CheckFlowLogo />

      {etapa === 'cpf' ? (
        <>
          <h1 className="text-center text-xl font-bold text-gray-800 mb-1">Recuperar senha</h1>
          <p className="text-center text-sm text-gray-500 mb-6">
            Informe seu CPF e enviaremos um código de verificação por WhatsApp (e e-mail, se cadastrado)
          </p>
          <form onSubmit={handleSolicitar} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
              <input
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={e => setCpf(formatCPF(e.target.value))}
                placeholder="Digite seu CPF"
                className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200"
                required
              />
            </div>
            {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-center text-xl font-bold text-gray-800 mb-1">Verificar código</h1>
          <p className="text-center text-sm text-gray-500 mb-6">{info}</p>
          <form onSubmit={handleVerificar} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de 6 dígitos</label>
              <input
                type="text"
                inputMode="numeric"
                value={codigo}
                onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full px-4 py-3 text-sm tracking-[0.5em] text-center bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200"
                required
              />
            </div>
            {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
              {loading ? 'Verificando...' : 'Verificar código'}
            </button>
            <button type="button" onClick={() => { setEtapa('cpf'); setErro(''); setCodigo('') }}
              className="w-full text-sm text-gray-500 hover:text-orange-500 transition-colors">
              Reenviar código / corrigir CPF
            </button>
          </form>
        </>
      )}

      <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-orange-500 transition-colors mt-4">
        <ArrowLeft size={14} />
        Voltar para o login
      </Link>
    </div>
  )
}
