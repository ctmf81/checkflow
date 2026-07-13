import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { criarSessaoResetAdmin, enviarLinkPrimeiroAcesso, criarCodigoOtp, enviarCodigoUsuario } from '@/lib/passwordReset'
import { autorizarPermissao } from '@/lib/apiAuth'

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Variáveis de ambiente Supabase não configuradas.')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Aprovar pré-cadastro é uma capacidade separada de "criar usuário": quando a
    // chamada vem da moderação (viaPreCadastro), exige 'aprovar_precadastro'.
    const acaoExigida = body?.viaPreCadastro ? 'aprovar_precadastro' : 'criar'
    const authz = await autorizarPermissao(req, 'usuarios', acaoExigida)
    if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: authz.status })

    const { email, nome, cpf, telefone, senhaTemp, empresaId, perfilId, unidades } = body

    const cpfDigits = (cpf ?? '').replace(/\D/g, '')
    const telDigits = (telefone ?? '').replace(/\D/g, '')

    if (cpfDigits.length !== 11) {
      return NextResponse.json({ message: 'CPF é obrigatório e deve ter 11 dígitos.' }, { status: 400 })
    }
    if (telDigits.length < 10 || telDigits.length > 11) {
      return NextResponse.json({ message: 'Telefone (com DDD) é obrigatório.' }, { status: 400 })
    }
    if (!empresaId || !perfilId) {
      return NextResponse.json({ message: 'Empresa e perfil são obrigatórios.' }, { status: 400 })
    }

    const supabaseAdmin = makeAdmin()

    // Ao menos 1 unidade quando a empresa tem unidades ativas — sem escopo de
    // unidade o usuário não opera. Espelha o guard do cliente (backstop p/ chamadas
    // diretas). Empresa sem unidade ativa (estado degenerado) não é barrada aqui.
    {
      const { data: unidadesAtivas } = await supabaseAdmin
        .from('unidades').select('id').eq('empresa_id', empresaId).eq('status', 'ativo').limit(1)
      const temUnidadeAtiva = (unidadesAtivas ?? []).length > 0
      if (temUnidadeAtiva && (!Array.isArray(unidades) || unidades.length === 0)) {
        return NextResponse.json({ message: 'Selecione ao menos uma unidade para o usuário.' }, { status: 400 })
      }
    }

    // ── Pessoa já cadastrada? (mesma pessoa pode estar em várias empresas) ──
    // CPFs são salvos com ou sem máscara (dados legados inconsistentes).
    // Consulta as duas variantes para não criar duplicatas.
    const cpfFormatado = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    const { data: existente } = await supabaseAdmin
      .from('usuarios').select('id, nome, email, telefone, primeiro_acesso')
      .in('cpf', [cpfDigits, cpfFormatado]).maybeSingle()

    if (existente) {
      const { data: jaVinculado } = await supabaseAdmin
        .from('usuario_empresa').select('usuario_id')
        .eq('usuario_id', existente.id).eq('empresa_id', empresaId).maybeSingle()
      if (jaVinculado) {
        return NextResponse.json({ message: 'Esta pessoa já está cadastrada nesta empresa.' }, { status: 409 })
      }

      const { error: ueErr } = await supabaseAdmin.from('usuario_empresa')
        .insert({ usuario_id: existente.id, empresa_id: empresaId, perfil_id: perfilId })
      if (ueErr) {
        return NextResponse.json({ message: 'Não foi possível vincular a pessoa à empresa.' }, { status: 400 })
      }

      if (Array.isArray(unidades) && unidades.length > 0) {
        const { error: uuErr } = await supabaseAdmin.from('usuario_unidade').upsert(
          unidades.map((uid: string) => ({ usuario_id: existente.id, unidade_id: uid })),
          { onConflict: 'usuario_id,unidade_id', ignoreDuplicates: true }
        )
        if (uuErr) {
          await supabaseAdmin.from('usuario_empresa').delete()
            .eq('usuario_id', existente.id).eq('empresa_id', empresaId)
          return NextResponse.json({ message: 'Não foi possível vincular a pessoa às unidades.' }, { status: 400 })
        }
      }

      // Se a pessoa existe mas NUNCA concluiu o primeiro acesso (não definiu
      // senha), reenvia o link — senão ela fica vinculada mas sem como entrar.
      let codigoReenviado = false
      let envioErro: string | undefined
      if (existente.primeiro_acesso) {
        const appUrl = (process.env.APP_URL ?? 'https://app.checkflow.digital').replace(/\/$/, '')
        const sessaoToken = await criarSessaoResetAdmin(supabaseAdmin, existente.id)
        const linkComToken = `${appUrl}/nova-senha?t=${sessaoToken}&uid=${existente.id}`
        const envio = await enviarLinkPrimeiroAcesso(
          { nome: existente.nome, email: existente.email, telefone: existente.telefone },
          linkComToken
        )
        codigoReenviado = envio.enviado
        envioErro = envio.erro
      }

      return NextResponse.json({ id: existente.id, vinculado: true, codigoReenviado, envioErro }, { status: 200 })
    }

    // E-mail é opcional. Sem e-mail real, gera um endereço técnico
    // (não-entregável) só para satisfazer o auth.users — login é por CPF.
    const emailFinal = (email ?? '').trim() || `${cpfDigits}@checkflow.local`

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailFinal,
      password: senhaTemp,
      email_confirm: true,
      user_metadata: { nome, role: 'usuario' },
    })

    if (authError || !authData.user) {
      const msg = authError?.message ?? ''
      const msgTraduzida = msg.toLowerCase().includes('already been registered') || msg.toLowerCase().includes('already registered')
        ? 'Já existe uma conta com este e-mail. Use um e-mail diferente ou deixe em branco.'
        : msg || 'Erro ao criar usuário.'
      return NextResponse.json({ message: msgTraduzida }, { status: 400 })
    }

    const { error: dbError } = await supabaseAdmin.from('usuarios').insert({
      id: authData.user.id,
      nome,
      email: emailFinal,
      cpf: cpfDigits,
      telefone: telDigits,
      status: 'ativo',
      primeiro_acesso: true,
    })

    if (dbError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      const msg = dbError.code === '23505'
        ? (dbError.message.includes('telefone')
            ? 'Já existe um usuário cadastrado com esse telefone.'
            : 'Já existe um usuário cadastrado com esse CPF ou e-mail.')
        : 'Erro ao salvar usuário.'
      return NextResponse.json({ message: msg }, { status: 409 })
    }

    // Vincula à empresa com o perfil escolhido (obrigatório p/ aparecer na empresa)
    const { error: ueError } = await supabaseAdmin.from('usuario_empresa').insert({
      usuario_id: authData.user.id, empresa_id: empresaId, perfil_id: perfilId,
    })
    if (ueError) {
      // Rollback: remove o usuário recém-criado para não deixar órfão
      await supabaseAdmin.from('usuarios').delete().eq('id', authData.user.id)
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ message: 'Erro ao vincular o usuário à empresa.' }, { status: 400 })
    }

    // Vincula às unidades selecionadas (opcional)
    if (Array.isArray(unidades) && unidades.length > 0) {
      const { error: uuError } = await supabaseAdmin.from('usuario_unidade').insert(
        unidades.map((uid: string) => ({ usuario_id: authData.user.id, unidade_id: uid }))
      )
      if (uuError) {
        await supabaseAdmin.from('usuarios').delete().eq('id', authData.user.id)
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        return NextResponse.json({ message: 'Erro ao vincular o usuário às unidades.' }, { status: 400 })
      }
    }

    // Envia link direto para definição de senha (sem etapa de código OTP)
    const appUrl = (process.env.APP_URL ?? 'https://app.checkflow.digital').replace(/\/$/, '')
    const sessaoToken = await criarSessaoResetAdmin(supabaseAdmin, authData.user.id)
    const linkComToken = `${appUrl}/nova-senha?t=${sessaoToken}&uid=${authData.user.id}`
    const envio = await enviarLinkPrimeiroAcesso(
      { nome, email: emailFinal, telefone: telDigits },
      linkComToken
    )

    return NextResponse.json(
      { id: authData.user.id, codigoEnviado: envio.enviado, envioErro: envio.erro },
      { status: 201 }
    )
  } catch (e: any) {
    return NextResponse.json({ message: e.message ?? 'Erro interno.' }, { status: 500 })
  }
}
