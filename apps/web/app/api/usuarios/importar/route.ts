import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://pswdjdlirylxgscohcfi.supabase.co',
  process.env.SUPABASE_SECRET_KEY!,
)

export async function POST(req: NextRequest) {
  try {
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

    return NextResponse.json({
      criados: resultados.filter(r => r.status === 'criado').length,
      existentes: resultados.filter(r => r.status === 'existente').length,
      erros: erros.length,
      detalhes: { resultados, erros },
    })
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 })
  }
}
