import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { autorizarPermissao } from '@/lib/apiAuth'
import { extrairLogoPath } from '@/lib/empresaExclusao'
import { caminhoLogo, validarArquivoLogo } from '@/lib/logoEmpresa'

// Troca/remoção da logo da empresa.
// O upload passa pelo servidor (service-role) porque a policy `upload_logo` do
// bucket `empresas` só libera INSERT em `logos/%` para is_admin_sistema() — o
// admin da empresa bateria em RLS se subisse direto do browser.

function admin(): SupabaseClient | null {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const url = envUrl.includes('.supabase.co') ? envUrl : 'https://pswdjdlirylxgscohcfi.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  if (!key) return null
  return createClient(url, key)
}

/** Garante que o chamador é da empresa alvo (ou admin de sistema). */
async function podeEditarEmpresa(sb: SupabaseClient, userId: string, empresaId: string) {
  const { data: vinculo } = await sb
    .from('usuario_empresa')
    .select('usuario_id')
    .eq('usuario_id', userId)
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (vinculo) return true
  const { data } = await sb.auth.admin.getUserById(userId)
  return data?.user?.app_metadata?.role === 'admin_sistema'
}

/** Apaga o arquivo antigo do bucket (best-effort — não bloqueia a troca). */
async function removerArquivoAntigo(sb: SupabaseClient, logoUrlAntiga: string | null) {
  const path = extrairLogoPath(logoUrlAntiga)
  if (!path) return
  await sb.storage.from('empresas').remove([path])
}

export async function POST(req: NextRequest) {
  try {
    const authz = await autorizarPermissao(req, 'empresas', 'editar')
    if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: authz.status })

    const form = await req.formData()
    const empresaId = String(form.get('empresaId') ?? '')
    const arquivo = form.get('arquivo')
    if (!empresaId) return NextResponse.json({ message: 'empresaId é obrigatório.' }, { status: 400 })
    if (!(arquivo instanceof File)) return NextResponse.json({ message: 'Selecione um arquivo de imagem.' }, { status: 400 })

    const erroArquivo = validarArquivoLogo(arquivo)
    if (erroArquivo) return NextResponse.json({ message: erroArquivo }, { status: 400 })

    const sb = admin()
    if (!sb) return NextResponse.json({ message: 'Configuração ausente.' }, { status: 500 })

    if (!await podeEditarEmpresa(sb, authz.userId, empresaId)) {
      return NextResponse.json({ message: 'Você não tem acesso a esta empresa.' }, { status: 403 })
    }

    const { data: empresa } = await sb.from('empresas').select('logo_url').eq('id', empresaId).maybeSingle()
    if (!empresa) return NextResponse.json({ message: 'Empresa não encontrada.' }, { status: 404 })

    const path = caminhoLogo(empresaId)
    const { error: erroUpload } = await sb.storage
      .from('empresas')
      .upload(path, await arquivo.arrayBuffer(), { contentType: arquivo.type, upsert: true })
    if (erroUpload) return NextResponse.json({ message: 'Erro ao enviar a logo. Tente novamente.' }, { status: 500 })

    const { data: pub } = sb.storage.from('empresas').getPublicUrl(path)

    const { error } = await sb.from('empresas')
      .update({ logo_url: pub.publicUrl, atualizado_em: new Date().toISOString(), atualizado_por: authz.userId })
      .eq('id', empresaId)
    if (error) {
      await sb.storage.from('empresas').remove([path])
      return NextResponse.json({ message: 'Erro ao salvar a logo. Tente novamente.' }, { status: 500 })
    }

    await removerArquivoAntigo(sb, empresa.logo_url)
    return NextResponse.json({ ok: true, logo_url: pub.publicUrl })
  } catch {
    return NextResponse.json({ message: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authz = await autorizarPermissao(req, 'empresas', 'editar')
    if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: authz.status })

    const { empresaId } = await req.json()
    if (!empresaId) return NextResponse.json({ message: 'empresaId é obrigatório.' }, { status: 400 })

    const sb = admin()
    if (!sb) return NextResponse.json({ message: 'Configuração ausente.' }, { status: 500 })

    if (!await podeEditarEmpresa(sb, authz.userId, empresaId)) {
      return NextResponse.json({ message: 'Você não tem acesso a esta empresa.' }, { status: 403 })
    }

    const { data: empresa } = await sb.from('empresas').select('logo_url').eq('id', empresaId).maybeSingle()
    if (!empresa) return NextResponse.json({ message: 'Empresa não encontrada.' }, { status: 404 })

    const { error } = await sb.from('empresas')
      .update({ logo_url: null, atualizado_em: new Date().toISOString(), atualizado_por: authz.userId })
      .eq('id', empresaId)
    if (error) return NextResponse.json({ message: 'Erro ao remover a logo. Tente novamente.' }, { status: 500 })

    await removerArquivoAntigo(sb, empresa.logo_url)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ message: 'Erro interno.' }, { status: 500 })
  }
}
