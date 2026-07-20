import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { assertUrlPublica } from '../lib/urlExterna'

export async function usuarioRoutes(app: FastifyInstance) {

  // POST /usuarios/sync-all — sincroniza usuários de todas as empresas com API
  // configurada. Usado pelo agendador (cron). Protegido por header
  // `x-cron-secret` (env CRON_SECRET), mesmo padrão de /catalogos/sync-all.
  // Estava ABERTO até 2026-07-18: um POST anônimo criava usuários via
  // auth.admin.createUser e inativava em massa (estrategia='inativar').
  app.post('/usuarios/sync-all', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) {
      return reply.status(401).send({ error: 'Não autorizado' })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { realtime: { transport: ws as any } }
    )

    // Busca empresas com API configurada
    const { data: empresas } = await supabase
      .from('empresas')
      .select('id, nome, importacao_api_url, importacao_api_headers, importacao_api_mapeamento, importacao_campo_status, importacao_status_ativo, importacao_estrategia, importacao_sistema_nome')
      .not('importacao_api_url', 'is', null)
      .eq('status', 'ativo')

    if (!empresas?.length) {
      return reply.send({ total: 0, mensagem: 'Nenhuma empresa com API configurada.' })
    }

    const { data: perfilOp } = await supabase
      .from('perfis').select('id').eq('nome', 'Operação').single()

    const resultados = []

    for (const empresa of empresas) {
      try {
        const fonteSistema = empresa.importacao_sistema_nome ?? 'api'
        const estrategia = empresa.importacao_estrategia ?? 'inativar'

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(empresa.importacao_api_headers ?? {}),
        }

        // Guard SSRF: a URL é configurada pela empresa — impede apontar para
        // hosts internos (metadata de nuvem, loopback, redes privadas).
        try {
          await assertUrlPublica(empresa.importacao_api_url)
        } catch (e: any) {
          resultados.push({ empresa: empresa.nome, erro: `URL de importação insegura: ${e.message}` })
          continue
        }

        // Timeout: uma URL que pendura não pode travar o processamento da fila.
        const res = await fetch(empresa.importacao_api_url, { headers, signal: AbortSignal.timeout(10000) })
        if (!res.ok) {
          resultados.push({ empresa: empresa.nome, erro: `API retornou ${res.status}` })
          continue
        }

        const json: any = await res.json()
        const itens: any[] = Array.isArray(json) ? json : (json.data ?? json.items ?? json.results ?? [])

        if (!itens.length) {
          resultados.push({ empresa: empresa.nome, sincronizados: 0 })
          continue
        }

        const mapa: Record<string, string> = empresa.importacao_api_mapeamento ?? {}
        const campoStatus = empresa.importacao_campo_status
        const valorAtivo = empresa.importacao_status_ativo

        let criados = 0, atualizados = 0, inativados = 0
        const emailsAtivos: string[] = []

        for (const item of itens) {
          const nome = mapa.nome ? String(item[mapa.nome] ?? '') : ''
          const email = mapa.email ? String(item[mapa.email] ?? '') : ''
          if (!nome || !email) continue

          // Determina status pelo campo mapeado ou presença na lista
          let statusExterno = 'ativo'
          if (campoStatus && valorAtivo) {
            const valorCampo = String(item[campoStatus] ?? '')
            statusExterno = valorCampo === valorAtivo ? 'ativo' : 'inativo'
          }

          if (statusExterno === 'ativo') emailsAtivos.push(email.toLowerCase())

          // Verifica se já existe
          const { data: existente } = await supabase
            .from('usuarios').select('id, status').eq('email', email).single()

          if (existente) {
            // Atualiza status se mudou
            if (existente.status !== statusExterno) {
              await supabase.from('usuarios').update({ status: statusExterno }).eq('id', existente.id)
              atualizados++
            }
            // Garante vínculo com fonte correta
            if (perfilOp && statusExterno === 'ativo') {
              await supabase.from('usuario_empresa').upsert({
                usuario_id: existente.id,
                empresa_id: empresa.id,
                perfil_id: perfilOp.id,
                fonte: 'api',
                fonte_sistema: fonteSistema,
              }, { onConflict: 'usuario_id,empresa_id' })
            }
            continue
          }

          if (statusExterno !== 'ativo') continue // não cria usuários já inativos

          // Cria no Auth
          const senhaTemp = Math.random().toString(36).slice(-8) + 'A1!'
          const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
            email,
            password: senhaTemp,
            email_confirm: true,
            user_metadata: { nome },
          })
          if (authErr || !authData.user) continue

          await supabase.from('usuarios').insert({
            id: authData.user.id,
            nome,
            email,
            cpf: mapa.cpf ? (item[mapa.cpf] ?? null) : null,
            telefone: mapa.telefone ? (item[mapa.telefone] ?? null) : null,
            status: 'ativo',
            primeiro_acesso: true,
          })

          if (perfilOp) {
            await supabase.from('usuario_empresa').upsert({
              usuario_id: authData.user.id,
              empresa_id: empresa.id,
              perfil_id: perfilOp.id,
              fonte: 'api',
              fonte_sistema: fonteSistema,
            }, { onConflict: 'usuario_id,empresa_id' })
          }
          criados++
        }

        // Inativa apenas usuários desta fonte/sistema que saíram da lista
        if (estrategia === 'inativar') {
          let q = supabase.from('usuario_empresa')
            .select('usuario:usuario_id(id, email)')
            .eq('empresa_id', empresa.id)
            .eq('fonte', 'api')
            .eq('fonte_sistema', fonteSistema) as any

          const { data: vinculados } = await q

          const inativar = (vinculados ?? [])
            .map((r: any) => r.usuario)
            .filter((u: any) => u && !emailsAtivos.includes(u.email?.toLowerCase()))
            .map((u: any) => u.id)

          if (inativar.length > 0) {
            await supabase.from('usuarios').update({ status: 'inativo' }).in('id', inativar)
            inativados = inativar.length
          }
        }

        resultados.push({ empresa: empresa.nome, criados, atualizados, inativados })
        app.log.info(`Sync ${empresa.nome}: ${criados} criados, ${atualizados} atualizados, ${inativados} inativados`)

      } catch (e: any) {
        app.log.error(`Sync erro ${empresa.nome}: ${e.message}`)
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
