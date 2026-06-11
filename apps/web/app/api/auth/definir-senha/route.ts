import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validarSessaoSenha } from '@/lib/passwordReset'

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Variáveis de ambiente Supabase não configuradas.')
  return createClient(url, key)
}

// POST /api/auth/definir-senha — etapa final do fluxo de código (recuperação ou primeiro acesso)
export async function POST(req: NextRequest) {
  try {
    const { cpf, token, novaSenha } = await req.json()
    const cpfDigits = (cpf ?? '').replace(/\D/g, '')

    if (cpfDigits.length !== 11 || !token) {
      return NextResponse.json({ message: 'Sessão inválida. Solicite um novo código.' }, { status: 400 })
    }
    if (!novaSenha || novaSenha.length < 8) {
      return NextResponse.json({ message: 'A senha deve ter no mínimo 8 caracteres.' }, { status: 400 })
    }

    const supabaseAdmin = makeAdmin()

    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('id, status')
      .eq('cpf', cpfDigits)
      .maybeSingle()

    if (!usuario || usuario.status !== 'ativo') {
      return NextResponse.json({ message: 'Sessão inválida. Solicite um novo código.' }, { status: 400 })
    }

    const sessaoValida = await validarSessaoSenha(supabaseAdmin, usuario.id, token)
    if (!sessaoValida) {
      return NextResponse.json({ message: 'Sessão expirada. Solicite um novo código.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(usuario.id, { password: novaSenha })
    if (error) {
      return NextResponse.json({ message: 'Não foi possível atualizar a senha.' }, { status: 500 })
    }

    await supabaseAdmin.from('usuarios').update({ primeiro_acesso: false }).eq('id', usuario.id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
