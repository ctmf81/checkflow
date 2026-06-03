'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { CheckFlowLogo } from '@/components/auth/CheckFlowLogo'
import { createClient } from '@/lib/supabase'

export default function NovaSenhaPage() {
  const router = useRouter()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }
    if (senha.length < 8) { setErro('Mínimo 8 caracteres.'); return }
    setErro('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: senha })
    setLoading(false)
    if (error) { setErro('Não foi possível atualizar a senha.'); return }
    router.push('/login')
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm px-8 py-10">
      <CheckFlowLogo />
      <h1 className="text-center text-xl font-bold text-gray-800 mb-1">Nova senha</h1>
      <p className="text-center text-sm text-gray-500 mb-6">Defina uma nova senha para sua conta</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
          <div className="relative">
            <input type={mostrar ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full px-4 py-3 pr-11 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200" required />
            <button type="button" onClick={() => setMostrar(!mostrar)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
          <input type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)}
            placeholder="Repita a nova senha"
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200" required />
        </div>
        {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
        <button type="submit" disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
          {loading ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>

      <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-orange-500 transition-colors mt-4">
        <ArrowLeft size={14} /> Voltar para o login
      </Link>
    </div>
  )
}
