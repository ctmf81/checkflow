import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autorizarPermissao } from '@/lib/apiAuth'

const ADMIN_EMPRESA_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  try {
    const authz = await autorizarPermissao(req, 'usuarios', 'editar')
    if (!authz.ok) return NextResponse.json({ error: authz.message }, { status: authz.status })

    const { usuarioId } = await req.json()
    if (!usuarioId) return NextResponse.json({ error: 'usuarioId obrigatório' }, { status: 400 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ error: 'Configuração de servidor ausente.' }, { status: 500 })
    const supabase = createClient(url, key)

    // Guard: bloqueia inativação do último admin_empresa em cada empresa onde o usuário é admin
    const { data: adminVinculos } = await supabase
      .from('usuario_empresa')
      .select('empresa_id')
      .eq('usuario_id', usuarioId)
      .eq('perfil_id', ADMIN_EMPRESA_ID)

    for (const vinculo of adminVinculos ?? []) {
      // Conta APENAS admins ATIVOS — inativos não contam como salvaguarda
      const { data: outrosAdmins } = await supabase
        .from('usuario_empresa')
        .select('usuario_id, usuario:usuario_id(status)')
        .eq('empresa_id', vinculo.empresa_id)
        .eq('perfil_id', ADMIN_EMPRESA_ID)
        .neq('usuario_id', usuarioId)

      const ativos = (outrosAdmins ?? []).filter((r: any) => r.usuario?.status === 'ativo').length

      if (ativos === 0) {
        return NextResponse.json(
          { error: 'Não é possível inativar o último administrador ativo da empresa. Atribua outro admin antes.' },
          { status: 409 }
        )
      }
    }

    const { error } = await supabase
      .from('usuarios')
      .update({ status: 'inativo' })
      .eq('id', usuarioId)

    if (error) return NextResponse.json({ error: 'Erro ao inativar usuário. Tente novamente.' }, { status: 500 })

    // Invalida todas as sessões ativas do usuário imediatamente
    await supabase.auth.admin.signOut(usuarioId, 'global')

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
