import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticarUsuario } from '@/lib/apiAuth'

// @username público do bot — usado só para montar o deep link (não é segredo).
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'checkflows_bot'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * POST /api/telegram/vincular
 *
 * Para o usuário logado: garante um telegram_link_code e devolve o deep link
 * (t.me/<bot>?start=<code>) + se já está vinculado. A UI mostra o link/QR; o
 * usuário dá /start no bot e o webhook (apps/api) grava o chat_id.
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarUsuario(req)
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })

  const sb = admin()
  const { data: u } = await sb
    .from('usuarios')
    .select('telegram_link_code, telegram_chat_id, telegram_primario')
    .eq('id', auth.userId)
    .maybeSingle()

  let code = u?.telegram_link_code as string | undefined
  if (!code) {
    code = crypto.randomUUID().replace(/-/g, '')
    const { error } = await sb.from('usuarios').update({ telegram_link_code: code }).eq('id', auth.userId)
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  }

  return NextResponse.json({
    deepLink: `https://t.me/${BOT_USERNAME}?start=${code}`,
    botUsername: BOT_USERNAME,
    vinculado: !!u?.telegram_chat_id,
    primario: !!u?.telegram_primario,
  })
}

/**
 * PATCH /api/telegram/vincular  { primario: boolean }
 * Liga/desliga "receber sempre pelo Telegram" (canal primário) do usuário logado.
 */
export async function PATCH(req: NextRequest) {
  const auth = await autenticarUsuario(req)
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })
  const { primario } = await req.json().catch(() => ({}))
  const sb = admin()
  const { error } = await sb.from('usuarios').update({ telegram_primario: !!primario }).eq('id', auth.userId)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, primario: !!primario })
}

/**
 * DELETE /api/telegram/vincular — desvincula o Telegram do usuário logado.
 */
export async function DELETE(req: NextRequest) {
  const auth = await autenticarUsuario(req)
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })
  const sb = admin()
  const { error } = await sb.from('usuarios')
    .update({ telegram_chat_id: null, telegram_vinculado_em: null })
    .eq('id', auth.userId)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
