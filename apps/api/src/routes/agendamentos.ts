import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

// Processa os agendamentos vencidos (checklists/workflows) via HTTP, para não
// depender do pg_cron — no Supabase free o pg_cron é instável (o projeto pausa
// por inatividade). Chama a mesma função `agendamentos_processar()`. Agendado no
// cron-job.org (a cada ~10 min), protegido por x-cron-secret. Idempotente:
// a função só pega os vencidos (proxima_execucao <= now) e empurra a próxima.

export async function agendamentosRoutes(app: FastifyInstance) {
  app.post('/cron/agendamentos/processar', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) return reply.status(401).send({ error: 'Não autorizado' })

    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
      { realtime: { transport: ws as any } })

    const { data, error } = await sb.rpc('agendamentos_processar')
    if (error) return reply.status(500).send({ ok: false, error: error.message })

    return reply.send({ ok: true, processados: data ?? 0 })
  })
}
