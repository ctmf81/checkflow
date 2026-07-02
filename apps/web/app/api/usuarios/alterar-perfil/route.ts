import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autorizarPermissao } from '@/lib/apiAuth'

const ADMIN_EMPRESA_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  try {
    const authz = await autorizarPermissao(req, 'usuarios', 'editar')
    if (!authz.ok) return NextResponse.json({ error: authz.message }, { status: authz.status })

    const { usuarioId, empresaId, perfilId } = await req.json()
    if (!usuarioId || !empresaId || !perfilId) {
      return NextResponse.json({ error: 'usuarioId, empresaId e perfilId são obrigatórios.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ error: 'Configuração de servidor ausente.' }, { status: 500 })
    const supabase = createClient(url, key)

    // Verifica se o usuário é admin_empresa nesta empresa e está sendo rebaixado
    const { data: vinculoAtual } = await supabase
      .from('usuario_empresa').select('perfil_id')
      .eq('usuario_id', usuarioId).eq('empresa_id', empresaId).maybeSingle()

    if (vinculoAtual?.perfil_id === ADMIN_EMPRESA_ID && perfilId !== ADMIN_EMPRESA_ID) {
      // Conta outros admins ativos na mesma empresa
      const { data: outrosAdmins } = await supabase
        .from('usuario_empresa')
        .select('usuario_id, usuario:usuario_id(status)')
        .eq('empresa_id', empresaId)
        .eq('perfil_id', ADMIN_EMPRESA_ID)
        .neq('usuario_id', usuarioId)

      const ativos = (outrosAdmins ?? []).filter((r: any) => r.usuario?.status === 'ativo').length
      if (ativos === 0) {
        return NextResponse.json(
          { error: 'Não é possível remover o perfil de Admin da empresa do último administrador ativo. Atribua outro admin antes.' },
          { status: 409 }
        )
      }
    }

    const { error } = await supabase.from('usuario_empresa')
      .update({ perfil_id: perfilId })
      .eq('usuario_id', usuarioId).eq('empresa_id', empresaId)

    if (error) return NextResponse.json({ error: 'Erro ao alterar perfil. Tente novamente.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
