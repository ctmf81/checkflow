'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle } from 'lucide-react'
import { CheckFlowLogo } from '@/components/auth/CheckFlowLogo'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [manter, setManter] = useState(true)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  function formatCPF(value: string) {
    return value.replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  function handleIdentificador(e: React.ChangeEvent<HTMLInputElement>) {
    setIdentificador(formatCPF(e.target.value))
  }

  async function resolverEmail(): Promise<string | null> {
    // Usa função RPC security-definer para não expor a tabela usuarios via anon
    const supabase = createClient()
    const { data } = await supabase.rpc('buscar_email_por_cpf', { p_cpf: identificador })
    return (data as string | null) ?? null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)

    try {
      const email = await resolverEmail()
      if (!email) {
        setErro('CPF não encontrado.')
        setLoading(false)
        return
      }

      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })

      if (error) {
        setErro('CPF ou senha incorretos.')
        setLoading(false)
        return
      }

      const user = data.user!
      const isAdmin = user.user_metadata?.role === 'admin_sistema'

      // Busca última sessão
      const { data: sessao } = await supabase
        .from('sessao_usuario')
        .select('ultimo_ambiente')
        .eq('usuario_id', user.id)
        .single()

      let destino = '/gestao'
      if (sessao?.ultimo_ambiente === 'sistema' && isAdmin) {
        destino = '/sistema'
      } else if (sessao?.ultimo_ambiente === 'operacao') {
        destino = '/operacao'
      } else if (sessao?.ultimo_ambiente === 'gestao') {
        destino = '/gestao'
      } else {
        // Primeira vez: admin vai para /sistema, outros para /gestao
        destino = isAdmin ? '/sistema' : '/gestao'
      }

      router.push(destino)
      router.refresh()
    } catch (e: any) {
      console.error('Login error:', e?.message ?? e)
      setErro(`Erro: ${e?.message ?? 'Falha na conexão'}`)
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm px-8 py-10">
      <CheckFlowLogo />

      <h1 className="text-center text-xl font-bold text-gray-800 mb-1">Login</h1>
      <p className="text-center text-sm text-gray-500 mb-6">
        Acesse sua conta fornecendo suas credenciais de acesso
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
          <input
            type="text"
            inputMode="numeric"
            value={identificador}
            onChange={handleIdentificador}
            placeholder="Digite seu CPF"
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
          <input
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder="Digite sua senha"
            className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200"
            required
          />
        </div>

        {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setManter(!manter)} className="flex items-center gap-1.5 text-sm text-gray-600">
            {manter ? <CheckCircle2 size={18} className="text-orange-500" /> : <Circle size={18} className="text-gray-300" />}
            Manter conectado
          </button>
          <Link href="/recuperar-senha" className="text-sm text-gray-500 hover:text-orange-500 transition-colors">
            Esqueceu sua senha?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors mt-2"
        >
          {loading ? 'Entrando...' : 'Login'}
        </button>
      </form>
    </div>
  )
}
