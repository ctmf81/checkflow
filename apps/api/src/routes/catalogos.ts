import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'

export async function catalogoRoutes(app: FastifyInstance) {

  // POST /catalogos/test-api — testa a API e retorna os campos disponíveis
  app.post('/catalogos/test-api', async (req, reply) => {
    const { url, headers: extraHeaders } = req.body as { url: string; headers?: Record<string, string> }

    if (!url) return reply.status(400).send({ error: 'URL obrigatória.' })

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(extraHeaders ?? {}),
      }
      const res = await fetch(url, { headers })
      if (!res.ok) return reply.status(502).send({ error: `API retornou ${res.status}` })

      const json = await res.json()
      const lista: any[] = Array.isArray(json) ? json : (json.data ?? json.items ?? json.results ?? [])
      const primeiro = lista[0]

      if (!primeiro) return reply.send({ campos: [], total: 0 })

      const campos = Object.keys(primeiro)
      return reply.send({ campos, total: lista.length, preview: lista.slice(0, 10) })
    } catch (e: any) {
      return reply.status(502).send({ error: `Erro: ${e.message}` })
    }
  })

  // POST /catalogos/:id/sync — sincroniza valores via API externa
  app.post<{ Params: { id: string } }>('/catalogos/:id/sync', async (req, reply) => {
    const { id } = req.params

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Busca configuração do catálogo
    const { data: catalogo, error: catErr } = await supabase
      .from('catalogos')
      .select('id, nome, campo_chave, atributo_1, atributo_2, atributo_3, atributo_4, api_url, api_headers, api_mapeamento')
      .eq('id', id)
      .single()

    if (catErr || !catalogo) {
      return reply.status(404).send({ error: 'Catálogo não encontrado.' })
    }

    if (!catalogo.api_url) {
      return reply.status(400).send({ error: 'URL da API não configurada.' })
    }

    // Faz o fetch na API externa
    let itens: any[]
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(catalogo.api_headers ?? {}),
      }
      const res = await fetch(catalogo.api_url, { headers })
      if (!res.ok) {
        return reply.status(502).send({ error: `API externa retornou ${res.status}: ${res.statusText}` })
      }
      const json = await res.json()
      // Aceita array direto ou objeto com array dentro (ex: { data: [...] } ou { items: [...] })
      itens = Array.isArray(json) ? json : (json.data ?? json.items ?? json.results ?? [])
    } catch (e: any) {
      return reply.status(502).send({ error: `Erro ao acessar API: ${e.message}` })
    }

    if (!itens.length) {
      return reply.send({ sincronizados: 0, mensagem: 'Nenhum item retornado pela API.' })
    }

    const mapa: Record<string, string> = catalogo.api_mapeamento ?? {}

    const valores = itens
      .map((item: any) => ({
        catalogo_id: id,
        valor_chave:  String(item[mapa.campo_chave  ?? catalogo.campo_chave] ?? '').trim(),
        atributo_1:   item[mapa.atributo_1 ?? ''] ? String(item[mapa.atributo_1]) : null,
        atributo_2:   item[mapa.atributo_2 ?? ''] ? String(item[mapa.atributo_2]) : null,
        atributo_3:   item[mapa.atributo_3 ?? ''] ? String(item[mapa.atributo_3]) : null,
        atributo_4:   item[mapa.atributo_4 ?? ''] ? String(item[mapa.atributo_4]) : null,
      }))
      .filter(v => v.valor_chave)

    // Upsert — atualiza se já existe, insere se não existe
    const { error: upsertErr } = await supabase
      .from('catalogo_valores')
      .upsert(valores, { onConflict: 'catalogo_id,valor_chave', ignoreDuplicates: false })

    if (upsertErr) {
      return reply.status(500).send({ error: `Erro ao salvar: ${upsertErr.message}` })
    }

    return reply.send({
      sincronizados: valores.length,
      mensagem: `${valores.length} itens sincronizados com sucesso.`,
    })
  })

  // POST /catalogos/sync-all — sincroniza todos os catálogos com API configurada
  // Usado pelo agendador (cron)
  app.post('/catalogos/sync-all', async (req, reply) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    const { data: catalogos } = await supabase
      .from('catalogos')
      .select('id, nome')
      .not('api_url', 'is', null)
      .eq('status', 'ativo')

    if (!catalogos?.length) {
      return reply.send({ sincronizados: 0, mensagem: 'Nenhum catálogo com API configurada.' })
    }

    const resultados = []
    for (const cat of catalogos) {
      try {
        const res = await fetch(
          `http://localhost:${process.env.PORT ?? 3001}/catalogos/${cat.id}/sync`,
          { method: 'POST' }
        )
        const json = await res.json()
        resultados.push({ id: cat.id, nome: cat.nome, ...json })
      } catch (e: any) {
        resultados.push({ id: cat.id, nome: cat.nome, error: e.message })
      }
    }

    return reply.send({ resultados, total: catalogos.length })
  })
}
