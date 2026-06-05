import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, nome, cpf, telefone, senhaTemp } = await req.json()

    // Usa service role para criar usuário no Auth
    const supabaseAdmin = createClient(
      'https://pswdjdlirylxgscohcfi.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzd2RqZGxpcnlseGdzY29oY2ZpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ5MDYxOCwiZXhwIjoyMDk2MDY2NjE4fQ.W1ngY6tPoep-Y_Q-1y1O_iECR8Ww1j2pqjMfN1QAWlE',
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
