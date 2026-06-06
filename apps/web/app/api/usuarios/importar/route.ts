import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ message: 'Configuração de servidor ausente.' }, { status: 500 })
    const supabaseAdmin = createClient(url, key)
    const { usuarios, empresaId, syncCompleto, fonte, fonteSistema } = await req.json() as {
      usuarios: { nome: string; email: string; cpf?: string; telefone?: string }[]
      empresaId?: string
      syncCompleto?: boolean
      fonte?: string        // 'manual' | 'api' | 'csv'
      fonteSistema?: string // ex: 'senior', 'oracle'
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

      // Vincula à empresa se informada (com perfil padrão "Operação")
      if (empresaId) {
        const { data: perfilOperacao } = await supabaseAdmin
          .from('perfis').select('id').eq('nome', 'Operação').single()
        if (perfilOperacao) {
          await supabaseAdmin.from('usuario_empresa').upsert({
            usuario_id: authData.user.id,
            empresa_id: empresaId,
            perfil_id: perfilOperacao.id,
            fonte: fonte ?? 'csv',
            fonte_sistema: fonteSistema ?? null,
          }, { onConflict: 'usuario_id,empresa_id' })
        }
      }

      resultados.push({ email: u.email, id: authData.user.id, status: 'criado' })
    }

    // Inativa apenas usuários da mesma fonte que não vieram na importação
    if (empresaId && syncCompleto) {
      const emailsImportados = usuarios.map(u => u.email.toLowerCase())
      let q = supabaseAdmin
        .from('usuario_empresa')
        .select('usuario:usuario_id(id, email)')
        .eq('empresa_id', empresaId)
        .eq('fonte', fonte ?? 'csv') // só mexe em usuários da mesma origem
      if (fonteSistema) q = q.eq('fonte_sistema', fonteSistema) as typeof q
      const { data: usuariosEmpresa } = await q

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
