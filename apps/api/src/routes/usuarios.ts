import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

export async function usuarioRoutes(app: FastifyInstance) {

  // POST /usuarios/sync-all — sincroniza usuários de todas as empresas com API configurada
  app.post('/usuarios/sync-all', async (req, reply) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { realtime: { transport: ws as any } }
    )

    // Busca empresas com API de importação configurada
    const { data: empresas } = await supabase
      .from('empresas')
      .select('id, nome, importacao_api_url, importacao_api_headers, importacao_api_mapeamento')
      .not('importacao_api_url', 'is', null)
      .eq('status', 'ativo')

    if (!empresas?.length) {
      return reply.send({ sincronizados: 0, mensagem: 'Nenhuma empresa com API de usuários configurada.' })
    }

    // Busca perfil Operação
    const { data: perfilOp } = await supabase
      .from('perfis').select('id').eq('nome', 'Operação').single()

    const resultados = []

    for (const empresa of empresas) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(empresa.importacao_api_headers ?? {}),
        }

        // Busca dados da API externa
        const res = await fetch(empresa.importacao_api_url, { headers })
        if (!res.ok) {
          resultados.push({ empresa: empresa.nome, erro: `API retornou ${res.status}` })
          continue
        }
        const json: any = await res.json()
        const itens: any[] = Array.isArray(json) ? json : (json.data ?? json.items ?? json.results ?? [])

        if (!itens.length) {
          resultados.push({ empresa: empresa.nome, sincronizados: 0, mensagem: 'Nenhum item retornado.' })
          continue
        }

        const mapa: Record<string, string> = empresa.importacao_api_mapeamento ?? {}
        const usuarios = itens
          .map(item => ({
            nome: mapa.nome ? String(item[mapa.nome] ?? '') : '',
            email: mapa.email ? String(item[mapa.email] ?? '') : '',
            cpf: mapa.cpf && item[mapa.cpf] ? String(item[mapa.cpf]) : null,
            telefone: mapa.telefone && item[mapa.telefone] ? String(item[mapa.telefone]) : null,
          }))
          .filter(u => u.nome && u.email)

        let criados = 0
        let existentes = 0
        const emailsImportados: string[] = []

        for (const u of usuarios) {
          emailsImportados.push(u.email.toLowerCase())

          // Verifica se já existe na tabela usuarios
          const { data: existente } = await supabase
            .from('usuarios').select('id').eq('email', u.email).single()

          if (existente) {
            existentes++
            // Garante vínculo com a empresa
            if (perfilOp) {
              await supabase.from('usuario_empresa').upsert({
                usuario_id: existente.id,
                empresa_id: empresa.id,
                perfil_id: perfilOp.id,
              }, { onConflict: 'usuario_id,empresa_id' })
            }
            continue
          }

          // Cria no Auth
          const senhaTemp = Math.random().toString(36).slice(-8) + 'A1!'
          const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
            email: u.email,
            password: senhaTemp,
            email_confirm: true,
            user_metadata: { nome: u.nome, role: 'usuario' },
          })

          if (authErr || !authData.user) continue

          // Insere na tabela usuarios
          await supabase.from('usuarios').insert({
            id: authData.user.id,
            nome: u.nome,
            email: u.email,
            cpf: u.cpf,
            telefone: u.telefone,
            status: 'ativo',
            primeiro_acesso: true,
          })

          // Vincula à empresa
          if (perfilOp) {
            await supabase.from('usuario_empresa').upsert({
              usuario_id: authData.user.id,
              empresa_id: empresa.id,
              perfil_id: perfilOp.id,
            }, { onConflict: 'usuario_id,empresa_id' })
          }

          criados++
        }

        // Inativa usuários que não vieram mais na importação
        const { data: usuariosEmpresa } = await supabase
          .from('usuario_empresa')
          .select('usuario:usuario_id(id, email)')
          .eq('empresa_id', empresa.id)

        const inativar = (usuariosEmpresa ?? [])
          .map((r: any) => r.usuario)
          .filter((u: any) => u && !emailsImportados.includes(u.email?.toLowerCase()))
          .map((u: any) => u.id)

        if (inativar.length > 0) {
          await supabase.from('usuarios').update({ status: 'inativo' }).in('id', inativar)
        }

        resultados.push({
          empresa: empresa.nome,
          criados,
          existentes,
          inativados: inativar.length,
        })
      } catch (e: any) {
        resultados.push({ empresa: empresa.nome, erro: e.message })
      }
    }

    return reply.send({
      total: empresas.length,
      resultados,
      mensagem: `Sync concluído para ${empresas.length} empresa(s).`,
    })
  })
}
