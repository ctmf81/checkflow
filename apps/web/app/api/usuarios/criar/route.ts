import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, nome, cpf, telefone, senhaTemp } = await req.json()

    // Usa service role para criar usuário no Auth
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    )

    // Cria no Supabase Auth
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

    // Insere na tabela usuarios
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
      // Rollback: remove do Auth se falhou no banco
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ message: 'Erro ao salvar usuário.' }, { status: 500 })
    }

    return NextResponse.json({ id: authData.user.id }, { status: 201 })
  } catch {
    return NextResponse.json({ message: 'Erro interno.' }, { status: 500 })
  }
}
