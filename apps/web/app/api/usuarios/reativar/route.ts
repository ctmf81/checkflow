import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autorizarPermissao } from '@/lib/apiAuth'

export async function POST(req: NextRequest) {
  try {
    const authz = await autorizarPermissao(req, 'usuarios', 'editar')
    if (!authz.ok) return NextResponse.json({ error: authz.message }, { status: authz.status })

    const { usuarioId } = await req.json()
    if (!usuarioId) return NextResponse.json({ error: 'usuarioId obrigatório' }, { status: 400 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ error: 'Configuração de servidor ausente.' }, { status: 500 })

    const { error } = await createClient(url, key)
      .from('usuarios')
      .update({ status: 'ativo' })
      .eq('id', usuarioId)

    if (error) return NextResponse.json({ error: 'Erro ao reativar usuário. Tente novamente.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
