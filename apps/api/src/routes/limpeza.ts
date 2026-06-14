import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import { executarLimpezaExecucoes } from '../lib/limpezaExecucoes'

export async function limpezaRoutes(app: FastifyInstance) {
  // POST /cron/limpeza-execucoes — disparo agendado (1x/dia)
  // Protegido por header `x-cron-secret` (env CRON_SECRET), mesmo padrão de /cron/parceiros/resumo-mensal.
  app.post('/cron/limpeza-execucoes', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) {
      return reply.status(401).send({ error: 'Não autorizado' })
    }

    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)

    try {
      const resultado = await executarLimpezaExecucoes(sb)
      return reply.send({ ok: true, ...resultado })
    } catch (e: any) {
      app.log.error(e)
      return reply.status(500).send({ error: e?.message ?? 'erro desconhecido' })
    }
  })
}
