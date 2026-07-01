import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
// Suporte ao nome antigo (SUPABASE_SERVICE_ROLE_KEY) e novo (SUPABASE_SECRET_KEY)
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

/**
 * POST /api/usuarios/impersonar
 * Body: { email: string }
 *
 * Apenas admins do sistema podem usar este endpoint.
 * Gera um magic link de login para o usuário alvo.
 */
export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SECRET) {
      return NextResponse.json({ message: 'Configuração do servidor incompleta.' }, { status: 500 })
    }

    // 1. Verifica o usuário chamador usando o token dele com o client público
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })

    // Client com chave pública para verificar o token do usuário logado
    const publicClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE || SUPABASE_SECRET)
    const { data: { user: caller }, error: callerErr } = await publicClient.auth.getUser(token)

    if (callerErr || !caller) {
      return NextResponse.json({ message: 'Sessão inválida. Faça login novamente.' }, { status: 401 })
    }

    if (caller.user_metadata?.role !== 'admin_sistema') {
      return NextResponse.json({ message: 'Apenas administradores do sistema podem usar este recurso.' }, { status: 403 })
    }

    // 2. Gera magic link usando o client admin (secret key)
    const { email } = await req.json()
    if (!email) return NextResponse.json({ message: 'Email obrigatório.' }, { status: 400 })

    // Railway injeta x-forwarded-host com o hostname público.
    // APP_URL é o segundo fallback; new URL(req.url).origin é só para dev local.
    const fwdHost = req.headers.get('x-forwarded-host')
    const fwdProto = req.headers.get('x-forwarded-proto') ?? 'https'
    const origin = fwdHost
      ? `${fwdProto}://${fwdHost}`
      : (process.env.APP_URL ?? '').replace(/\/$/, '') || new URL(req.url).origin

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET)
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${origin}/login` },
    })

    if (error || !data?.properties?.action_link) {
      return NextResponse.json({ message: error?.message ?? 'Erro ao gerar link.' }, { status: 500 })
    }

    return NextResponse.json({ link: data.properties.action_link })
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
