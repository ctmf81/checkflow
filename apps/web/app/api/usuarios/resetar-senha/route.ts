import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { contarSolicitacoesRecentes, enviarAvisoResetAdmin } from '@/lib/passwordReset'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!

// POST /api/usuarios/resetar-senha — admin/gestor dispara reset de senha (envio de código por WhatsApp + e-mail)
export async function POST(req: NextRequest) {
  try {
    const { usuarioId } = await req.json()
    if (!usuarioId) return NextResponse.json({ message: 'usuarioId é obrigatório.' }, { status: 400 })

    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })

    const callerClient = createClient(SUPABASE_URL, (SUPABASE_PUBLISHABLE || SUPABASE_SECRET) as string, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser(token)
    if (callerErr || !caller) {
      return NextResponse.json({ message: 'Sessão inválida. Faça login novamente.' }, { status: 401 })
    }

    const isAdminSistema = caller.user_metadata?.role === 'admin_sistema'

    let autorizado = isAdminSistema
    if (!autorizado) {
      const { data: temPermissao } = await callerClient.rpc('usuario_tem_permissao', {
        p_recurso: 'usuarios',
        p_acao: 'editar',
      })
      autorizado = !!temPermissao
    }

    if (!autorizado) {
      return NextResponse.json({ message: 'Você não tem permissão para resetar senhas de usuários.' }, { status: 403 })
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET)

    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('id, nome, email, telefone, status')
      .eq('id', usuarioId)
      .maybeSingle()

    if (!usuario || usuario.status !== 'ativo') {
      return NextResponse.json({ message: 'Usuário não encontrado.' }, { status: 404 })
    }
    if (!usuario.telefone) {
      return NextResponse.json({ message: 'Este usuário não possui telefone cadastrado.' }, { status: 422 })
    }

    const recentes = await contarSolicitacoesRecentes(supabaseAdmin, usuario.id, 'reset_admin')
    if (recentes >= 5) {
      return NextResponse.json({ message: 'Muitos resets recentes para este usuário. Aguarde alguns minutos.' }, { status: 429 })
    }

    await enviarAvisoResetAdmin(usuario as any)

    return NextResponse.json({ ok: true, message: `Link de redefinição enviado para ${usuario.nome} via WhatsApp${usuario.email && !usuario.email.endsWith('@checkflow.local') ? ' e e-mail' : ''}.` })
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
