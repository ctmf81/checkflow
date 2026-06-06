import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { usuarioId } = await req.json()
    if (!usuarioId) return NextResponse.json({ error: 'usuarioId obrigatório' }, { status: 400 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ error: 'Configuração de servidor ausente.' }, { status: 500 })
    const supabase = createClient(url, key)

    const { error } = await supabase
      .from('usuarios')
      .update({ status: 'inativo' })
      .eq('id', usuarioId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
