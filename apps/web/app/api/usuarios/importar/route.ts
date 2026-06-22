import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { criarCodigoOtp, enviarCodigoUsuario } from '@/lib/passwordReset'
import { autorizarPermissao } from '@/lib/apiAuth'

export async function POST(req: NextRequest) {
  try {
    const authz = await autorizarPermissao(req, 'usuarios', 'criar')
    if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: authz.status })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ message: 'Configuração de servidor ausente.' }, { status: 500 })
    const supabaseAdmin = createClient(url, key)
    const { usuarios, empresaId, syncCompleto, fonte, fonteSistema } = await req.json() as {
      usuarios: { nome: string; email?: string; cpf?: string; telefone?: string }[]
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
      const cpfDigits = (u.cpf ?? '').replace(/\D/g, '')
      const telDigits = (u.telefone ?? '').replace(/\D/g, '')

      if (!u.nome || cpfDigits.length !== 11 || telDigits.length < 10 || telDigits.length > 11) {
        erros.push({ email: u.email ?? u.cpf ?? '?', erro: 'Nome, CPF (11 dígitos) e telefone (com DDD) são obrigatórios.' })
        continue
      }

      const emailFinal = (u.email ?? '').trim() || `${cpfDigits}@checkflow.local`

      // Verifica se já existe (por CPF, que agora é o identificador de login)
      const { data: existente } = await supabaseAdmin
        .from('usuarios').select('id').eq('cpf', cpfDigits).maybeSingle()

      if (existente) {
        resultados.push({ email: emailFinal, id: existente.id, status: 'existente' })
        continue
      }

      // Cria no Auth
      const senhaTemp = Math.random().toString(36).slice(-8) + 'A1!'
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: emailFinal,
        password: senhaTemp,
        email_confirm: true,
        user_metadata: { nome: u.nome, role: 'usuario' },
      })

      if (authErr || !authData.user) {
        erros.push({ email: emailFinal, erro: authErr?.message ?? 'Erro ao criar.' })
        continue
      }

      // Insere na tabela usuarios
      const { error: dbErr } = await supabaseAdmin.from('usuarios').insert({
        id: authData.user.id,
        nome: u.nome,
        email: emailFinal,
        cpf: cpfDigits,
        telefone: telDigits,
        status: 'ativo',
        primeiro_acesso: true,
      })

      if (dbErr) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        const msg = dbErr.code === '23505' ? 'CPF, telefone ou e-mail já cadastrado.' : 'Erro ao salvar usuário.'
        erros.push({ email: emailFinal, erro: msg })
        continue
      }

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

      // Dispara código de primeiro acesso por WhatsApp (e e-mail, se houver)
      try {
        const codigo = await criarCodigoOtp(supabaseAdmin, authData.user.id, 'primeiro_acesso')
        await enviarCodigoUsuario(
          supabaseAdmin,
          { id: authData.user.id, nome: u.nome, email: emailFinal, telefone: telDigits },
          codigo,
          'primeiro_acesso'
        )
      } catch { /* não bloqueia a importação */ }

      resultados.push({ email: emailFinal, id: authData.user.id, status: 'criado' })
    }

    // Inativa apenas usuários da mesma fonte que não vieram na importação
    if (empresaId && syncCompleto) {
      const cpfsImportados = usuarios.map(u => (u.cpf ?? '').replace(/\D/g, '')).filter(Boolean)
      let q = supabaseAdmin
        .from('usuario_empresa')
        .select('usuario:usuario_id(id, cpf)')
        .eq('empresa_id', empresaId)
        .eq('fonte', fonte ?? 'csv') // só mexe em usuários da mesma origem
      if (fonteSistema) q = q.eq('fonte_sistema', fonteSistema) as typeof q
      const { data: usuariosEmpresa } = await q

      const inativar = (usuariosEmpresa ?? [])
        .map((r: any) => r.usuario)
        .filter((u: any) => u && !cpfsImportados.includes(u.cpf))
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
