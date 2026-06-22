'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckFlowLogo } from '@/components/auth/CheckFlowLogo'
import { createClient } from '@/lib/supabase'
import type { User, SupabaseClient } from '@supabase/supabase-js'

// Destino pós-login a partir do último ambiente salvo + papel do usuário.
// Usado tanto no submit do formulário quanto ao detectar uma sessão já ativa
// (ex: magic link de impersonação, que estabelece a sessão pelo hash da URL).
async function destinoPosLogin(supabase: SupabaseClient, user: User, redirect?: string | null): Promise<string> {
  if (redirect && redirect.startsWith('/')) return redirect
  const isAdmin = user.user_metadata?.role === 'admin_sistema'
  const { data: sessao } = await supabase
    .from('sessao_usuario').select('ultimo_ambiente').eq('usuario_id', user.id).single()
  if (sessao?.ultimo_ambiente === 'sistema' && isAdmin) return '/sistema'
  if (sessao?.ultimo_ambiente === 'operacao') return '/operacao'
  if (sessao?.ultimo_ambiente === 'gestao') return '/gestao'
  return isAdmin ? '/sistema' : '/gestao'
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  // Se já existe uma sessão ao abrir o /login (ex: magic link de impersonação,
  // ou usuário já logado), encaminha para o ambiente certo em vez de mostrar
  // o formulário. O client do Supabase processa o hash da URL (detectSessionInUrl).
  useEffect(() => {
    const supabase = createClient()
    let ativo = true
    async function checar(user: User | null | undefined) {
      if (!ativo || !user) return
      const destino = await destinoPosLogin(supabase, user, searchParams.get('redirect'))
      router.replace(destino)
    }
    supabase.auth.getSession().then(({ data }) => checar(data.session?.user))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') checar(session?.user)
    })
    return () => { ativo = false; sub.subscription.unsubscribe() }
  }, [])

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

      // Turno modo 'login': barra o acesso fora do horário (admins isentos,
      // verificado no Postgres). Quem já está logado não é afetado.
      const { data: podeAcessar } = await supabase.rpc('usuario_pode_acessar', { p_usuario_id: user.id })
      if (podeAcessar === false) {
        await supabase.auth.signOut()
        setErro('Acesso permitido apenas dentro do seu turno de trabalho.')
        setLoading(false)
        return
      }

      const destino = await destinoPosLogin(supabase, user, searchParams.get('redirect'))
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

        <div className="flex items-center justify-end">
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

      <Link href="/primeiro-acesso" className="block text-center text-sm text-gray-500 hover:text-orange-500 transition-colors mt-4">
        Primeiro acesso? Defina sua senha aqui
      </Link>
    </div>
  )
}
