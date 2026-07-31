import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autorizarPermissao } from '@/lib/apiAuth'

// @username público do bot — para montar o deep link.
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'checkflows_bot'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * POST /api/telegram/convite  { usuarioId }
 *
 * Gestor/admin gera o deep link de vínculo de UM operador (para compartilhar
 * ou mostrar o QR). Garante o telegram_link_code do usuário-alvo e devolve o
 * link + status. Exige permissão de gestão de usuários.
 */
export async function POST(req: NextRequest) {
  const auth = await autorizarPermissao(req, 'usuarios', 'editar')
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })

  const { usuarioId } = await req.json().catch(() => ({}))
  if (!usuarioId) return NextResponse.json({ message: 'usuarioId é obrigatório.' }, { status: 400 })

  const sb = admin()
  const { data: u } = await sb.from('usuarios')
    .select('nome, telegram_link_code, telegram_chat_id')
    .eq('id', usuarioId).maybeSingle()
  if (!u) return NextResponse.json({ message: 'Usuário não encontrado.' }, { status: 404 })

  let code = u.telegram_link_code as string | undefined
  if (!code) {
    code = crypto.randomUUID().replace(/-/g, '')
    const { error } = await sb.from('usuarios').update({ telegram_link_code: code }).eq('id', usuarioId)
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  }

  return NextResponse.json({
    nome: u.nome,
    deepLink: `https://t.me/${BOT_USERNAME}?start=${code}`,
    vinculado: !!u.telegram_chat_id,
  })
}
