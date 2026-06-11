import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { criarCodigoOtp, enviarCodigoUsuario } from '@/lib/passwordReset'

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Variáveis de ambiente Supabase não configuradas.')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const { email, nome, cpf, telefone, senhaTemp } = await req.json()

    const cpfDigits = (cpf ?? '').replace(/\D/g, '')
    const telDigits = (telefone ?? '').replace(/\D/g, '')

    if (cpfDigits.length !== 11) {
      return NextResponse.json({ message: 'CPF é obrigatório e deve ter 11 dígitos.' }, { status: 400 })
    }
    if (telDigits.length < 10 || telDigits.length > 11) {
      return NextResponse.json({ message: 'Telefone (com DDD) é obrigatório.' }, { status: 400 })
    }

    const supabaseAdmin = makeAdmin()

    // E-mail é opcional. Sem e-mail real, gera um endereço técnico
    // (não-entregável) só para satisfazer o auth.users — login é por CPF.
    const emailFinal = (email ?? '').trim() || `${cpfDigits}@checkflow.local`

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailFinal,
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
      email: emailFinal,
      cpf: cpfDigits,
      telefone: telDigits,
      status: 'ativo',
      primeiro_acesso: true,
    })

    if (dbError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      const msg = dbError.code === '23505'
        ? (dbError.message.includes('telefone')
            ? 'Já existe um usuário cadastrado com esse telefone.'
            : 'Já existe um usuário cadastrado com esse CPF ou e-mail.')
        : 'Erro ao salvar usuário.'
      return NextResponse.json({ message: msg }, { status: 409 })
    }

    // Dispara código de primeiro acesso por WhatsApp (e e-mail, se houver)
    const codigo = await criarCodigoOtp(supabaseAdmin, authData.user.id, 'primeiro_acesso')
    await enviarCodigoUsuario(
      supabaseAdmin,
      { id: authData.user.id, nome, email: emailFinal, telefone: telDigits },
      codigo,
      'primeiro_acesso'
    )

    return NextResponse.json({ id: authData.user.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
