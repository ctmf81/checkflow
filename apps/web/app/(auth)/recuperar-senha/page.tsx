'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CheckFlowLogo } from '@/components/auth/CheckFlowLogo'
import { createClient } from '@/lib/supabase'

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nova-senha`,
    })
    setLoading(false)
    if (error) {
      setErro('Não foi possível enviar o e-mail. Verifique o endereço.')
      return
    }
    setEnviado(true)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm px-8 py-10">
      <CheckFlowLogo />

      {!enviado ? (
        <>
          <h1 className="text-center text-xl font-bold text-gray-800 mb-1">Recuperar senha</h1>
          <p className="text-center text-sm text-gray-500 mb-6">
            Informe seu e-mail e enviaremos um link para redefinir sua senha
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Digite seu e-mail"
                className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200"
                required
              />
            </div>
            {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
              {loading ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>
          </form>
        </>
      ) : (
        <div className="text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">E-mail enviado!</h2>
          <p className="text-sm text-gray-500 mb-6">
            Verifique sua caixa de entrada em <span className="font-medium text-gray-700">{email}</span> e siga as instruções.
          </p>
        </div>
      )}

      <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-orange-500 transition-colors mt-4">
        <ArrowLeft size={14} />
        Voltar para o login
      </Link>
    </div>
  )
}
