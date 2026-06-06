import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Variáveis de ambiente Supabase não configuradas.')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const { email, nome, cpf, telefone, senhaTemp } = await req.json()

    const supabaseAdmin = makeAdmin()

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senhaTemp,
      email_confirm: true,
      user_metadata: { nome, role: 'usuario' },
    })

    if (authError || !authData.user) {
      return NextResponse.json(
        { message: authError?.message ?? 'Erro ao criar usuário.' },
        { status: 400 }
      )
    }

    const { error: dbError } = await supabaseAdmin.from('usuarios').insert({
      id: authData.user.id,
      nome,
      email,
      cpf: cpf || null,
      telefone: telefone || null,
      status: 'ativo',
      primeiro_acesso: true,
    })

    if (dbError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ message: 'Erro ao salvar usuário.' }, { status: 500 })
    }

    return NextResponse.json({ id: authData.user.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
