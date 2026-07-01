import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validarSessaoSenha, cpfVariantes } from '@/lib/passwordReset'

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Variáveis de ambiente Supabase não configuradas.')
  return createClient(url, key)
}

// POST /api/auth/definir-senha — etapa final do fluxo de código (recuperação ou primeiro acesso)
// Aceita dois modos:
//   - Fluxo OTP (self-service): { cpf, token, novaSenha }
//   - Fluxo magic link (admin reset): { uid, token, novaSenha }
export async function POST(req: NextRequest) {
  try {
    const { cpf, uid, token, novaSenha } = await req.json()

    if (!token) {
      return NextResponse.json({ message: 'Sessão inválida. Solicite um novo link.' }, { status: 400 })
    }
    if (!novaSenha || novaSenha.length < 8) {
      return NextResponse.json({ message: 'A senha deve ter no mínimo 8 caracteres.' }, { status: 400 })
    }

    const supabaseAdmin = makeAdmin()
    let usuarioId: string

    if (uid) {
      // Modo magic link: encontra usuário pelo ID diretamente
      const { data: u } = await supabaseAdmin
        .from('usuarios').select('id, status').eq('id', uid).maybeSingle()
      if (!u || u.status !== 'ativo') {
        return NextResponse.json({ message: 'Link inválido ou expirado.' }, { status: 400 })
      }
      usuarioId = u.id
    } else {
      // Modo OTP: encontra usuário pelo CPF
      const cpfDigits = (cpf ?? '').replace(/\D/g, '')
      if (cpfDigits.length !== 11) {
        return NextResponse.json({ message: 'Sessão inválida. Solicite um novo código.' }, { status: 400 })
      }
      const { data: encontrados } = await supabaseAdmin
        .from('usuarios').select('id, status').in('cpf', cpfVariantes(cpf)).limit(1)
      const u = encontrados?.[0]
      if (!u || u.status !== 'ativo') {
        return NextResponse.json({ message: 'Sessão inválida. Solicite um novo código.' }, { status: 400 })
      }
      usuarioId = u.id
    }

    const sessaoValida = await validarSessaoSenha(supabaseAdmin, usuarioId, token)
    if (!sessaoValida) {
      return NextResponse.json({ message: uid ? 'Link expirado. Peça ao administrador para enviar um novo.' : 'Sessão expirada. Solicite um novo código.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(usuarioId, { password: novaSenha })
    if (error) {
      return NextResponse.json({ message: 'Não foi possível atualizar a senha.' }, { status: 500 })
    }

    await supabaseAdmin.from('usuarios').update({ primeiro_acesso: false }).eq('id', usuarioId)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
