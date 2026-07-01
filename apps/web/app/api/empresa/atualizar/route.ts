import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autorizarPermissao } from '@/lib/apiAuth'

export async function POST(req: NextRequest) {
  try {
    const authz = await autorizarPermissao(req, 'empresas', 'editar')
    if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: authz.status })

    const { empresaId, nome, cnpj } = await req.json()
    if (!empresaId || !nome?.trim()) {
      return NextResponse.json({ message: 'empresaId e nome são obrigatórios.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ message: 'Configuração ausente.' }, { status: 500 })

    const { error } = await createClient(url, key)
      .from('empresas')
      .update({ nome: nome.trim(), cnpj: cnpj?.trim() || null, atualizado_em: new Date().toISOString() })
      .eq('id', empresaId)

    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
