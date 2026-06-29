import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validarCodigoOtp, cpfVariantes } from '@/lib/passwordReset'

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Variáveis de ambiente Supabase não configuradas.')
  return createClient(url, key)
}

// POST /api/auth/verificar-codigo — valida o código OTP (recuperação ou primeiro acesso)
export async function POST(req: NextRequest) {
  try {
    const { cpf, codigo } = await req.json()
    const cpfDigits = (cpf ?? '').replace(/\D/g, '')
    const codigoDigits = (codigo ?? '').replace(/\D/g, '')

    if (cpfDigits.length !== 11 || codigoDigits.length !== 6) {
      return NextResponse.json({ message: 'CPF ou código inválido.' }, { status: 400 })
    }

    const supabaseAdmin = makeAdmin()

    const { data: encontrados } = await supabaseAdmin
      .from('usuarios')
      .select('id, status')
      .in('cpf', cpfVariantes(cpf))
      .limit(1)
    const usuario = encontrados?.[0]

    if (!usuario || usuario.status !== 'ativo') {
      return NextResponse.json({ message: 'Código inválido ou expirado.' }, { status: 400 })
    }

    const resultado = await validarCodigoOtp(supabaseAdmin, usuario.id, codigoDigits)
    if (!resultado.ok) {
      return NextResponse.json({ message: resultado.erro }, { status: 400 })
    }

    return NextResponse.json({ token: resultado.sessaoToken })
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
