import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Variáveis de ambiente Supabase não configuradas.')
  return createClient(url, key)
}

/**
 * POST /api/usuarios/impersonar
 * Body: { email: string }
 *
 * Apenas admins do sistema podem usar este endpoint.
 * Gera um magic link de login para o usuário alvo.
 * O frontend redireciona para ele — nenhuma senha é exposta.
 */
export async function POST(req: NextRequest) {
  try {
    // Verifica se quem chama é admin_sistema
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })

    const admin = makeAdmin()

    const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(token)
    if (callerErr || !caller) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
    if (caller.user_metadata?.role !== 'admin_sistema') {
      return NextResponse.json({ message: 'Apenas administradores do sistema podem usar este recurso.' }, { status: 403 })
    }

    const { email } = await req.json()
    if (!email) return NextResponse.json({ message: 'Email obrigatório.' }, { status: 400 })

    // Gera magic link de login como o usuário alvo
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (error || !data?.properties?.action_link) {
      return NextResponse.json({ message: error?.message ?? 'Erro ao gerar link.' }, { status: 500 })
    }

    return NextResponse.json({ link: data.properties.action_link })
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
