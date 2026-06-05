import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      'https://pswdjdlirylxgscohcfi.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzd2RqZGxpcnlseGdzY29oY2ZpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ5MDYxOCwiZXhwIjoyMDk2MDY2NjE4fQ.W1ngY6tPoep-Y_Q-1y1O_iECR8Ww1j2pqjMfN1QAWlE',
    )
    const { usuarios, empresaId } = await req.json() as {
      usuarios: { nome: string; email: string; cpf?: string; telefone?: string }[]
      empresaId?: string
    }

    if (!usuarios?.length) {
      return NextResponse.json({ message: 'Nenhum usuário para importar.' }, { status: 400 })
    }

    const resultados = []
    const erros = []

    for (const u of usuarios) {
      if (!u.email || !u.nome) { erros.push({ email: u.email, erro: 'Nome e e-mail obrigatórios.' }); continue }

      // Verifica se já existe
      const { data: existente } = await supabaseAdmin
        .from('usuarios').select('id').eq('email', u.email).single()

      if (existente) {
        resultados.push({ email: u.email, id: existente.id, status: 'existente' })
        continue
      }

      // Cria no Auth
      const senhaTemp = Math.random().toString(36).slice(-8) + 'A1!'
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: senhaTemp,
        email_confirm: true,
        user_metadata: { nome: u.nome, role: 'usuario' },
      })

      if (authErr || !authData.user) {
        erros.push({ email: u.email, erro: authErr?.message ?? 'Erro ao criar.' })
        continue
      }

      // Insere na tabela usuarios
      await supabaseAdmin.from('usuarios').insert({
        id: authData.user.id,
        nome: u.nome,
        email: u.email,
        cpf: u.cpf || null,
        telefone: u.telefone || null,
        status: 'ativo',
        primeiro_acesso: true,
      })

      resultados.push({ email: u.email, id: authData.user.id, status: 'criado' })
    }

    // Inativa usuários da empresa que não vieram mais na importação
    if (empresaId) {
      const emailsImportados = usuarios.map(u => u.email.toLowerCase())
      const { data: usuariosEmpresa } = await supabaseAdmin
        .from('usuario_empresa')
        .select('usuario:usuario_id(id, email)')
        .eq('empresa_id', empresaId)

      const inativar = (usuariosEmpresa ?? [])
        .map((r: any) => r.usuario)
        .filter((u: any) => u && !emailsImportados.includes(u.email?.toLowerCase()))
        .map((u: any) => u.id)

      if (inativar.length > 0) {
        await supabaseAdmin.from('usuarios')
          .update({ status: 'inativo' })
          .in('id', inativar)
      }
    }

    return NextResponse.json({
      criados: resultados.filter(r => r.status === 'criado').length,
      existentes: resultados.filter(r => r.status === 'existente').length,
      inativados: empresaId ? (resultados.length) : 0,
      erros: erros.length,
      detalhes: { resultados, erros },
    })
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 })
  }
}
