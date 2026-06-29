import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { criarCodigoOtp, contarSolicitacoesRecentes, enviarCodigoUsuario, cpfVariantes } from '@/lib/passwordReset'

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

    const { data: encontrados } = await supabaseAdmin
      .from('usuarios')
      .select('id, nome, email, telefone, status')
      .in('cpf', cpfVariantes(cpf))
      .limit(1)
    const usuario = encontrados?.[0]

    // Não revela se o CPF existe ou não
    if (!usuario || usuario.status !== 'ativo') {
      return NextResponse.json(RESPOSTA_GENERICA)
    }

    // Sem telefone não há como entregar o código — mas a resposta continua
    // genérica para não revelar que o CPF existe (anti-enumeração).
    // O usuário legado sem telefone aparece na view `usuarios_sem_contato`.
    if (!usuario.telefone) {
      console.warn(`[solicitar-codigo] usuário ${usuario.id} sem telefone — código não enviado`)
      return NextResponse.json(RESPOSTA_GENERICA)
    }

    // Anti-abuso: máx. 3 solicitações por hora. Resposta genérica também aqui —
    // um 429 só para CPFs existentes permitiria enumeração.
    const recentes = await contarSolicitacoesRecentes(supabaseAdmin, usuario.id, 'self_service')
    if (recentes >= 3) {
      console.warn(`[solicitar-codigo] rate limit atingido para usuário ${usuario.id}`)
      return NextResponse.json(RESPOSTA_GENERICA)
    }

    const codigo = await criarCodigoOtp(supabaseAdmin, usuario.id, 'self_service')
    await enviarCodigoUsuario(supabaseAdmin, usuario as any, codigo, 'self_service')

    return NextResponse.json(RESPOSTA_GENERICA)
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
