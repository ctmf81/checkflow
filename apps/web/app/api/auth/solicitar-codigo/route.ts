import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { criarCodigoOtp, contarSolicitacoesRecentes, enviarCodigoUsuario } from '@/lib/passwordReset'

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Variáveis de ambiente Supabase não configuradas.')
  return createClient(url, key)
}

const RESPOSTA_GENERICA = {
  message: 'Se o CPF informado estiver cadastrado, enviaremos um código de verificação por WhatsApp e e-mail.',
}

// POST /api/auth/solicitar-codigo — fluxo "esqueci minha senha" (self-service)
export async function POST(req: NextRequest) {
  try {
    const { cpf } = await req.json()
    const cpfDigits = (cpf ?? '').replace(/\D/g, '')
    if (cpfDigits.length !== 11) {
      return NextResponse.json({ message: 'CPF inválido.' }, { status: 400 })
    }

    const supabaseAdmin = makeAdmin()

    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('id, nome, email, telefone, status')
      .eq('cpf', cpfDigits)
      .maybeSingle()

    // Não revela se o CPF existe ou não
    if (!usuario || usuario.status !== 'ativo') {
      return NextResponse.json(RESPOSTA_GENERICA)
    }

    if (!usuario.telefone) {
      return NextResponse.json({
        message: 'Este usuário não possui telefone cadastrado para recuperação. Procure o administrador da sua empresa.',
      }, { status: 422 })
    }

    // Anti-abuso: máx. 3 solicitações por hora
    const recentes = await contarSolicitacoesRecentes(supabaseAdmin, usuario.id, 'self_service')
    if (recentes >= 3) {
      return NextResponse.json({
        message: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.',
      }, { status: 429 })
    }

    const codigo = await criarCodigoOtp(supabaseAdmin, usuario.id, 'self_service')
    await enviarCodigoUsuario(supabaseAdmin, usuario as any, codigo, 'self_service')

    return NextResponse.json(RESPOSTA_GENERICA)
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
