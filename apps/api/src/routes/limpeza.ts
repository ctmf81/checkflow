import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import { executarLimpezaExecucoes, executarLimpezaTickets, executarLimpezaTarefas } from '../lib/limpezaExecucoes'

export async function limpezaRoutes(app: FastifyInstance) {
  // POST /cron/limpeza-execucoes — disparo agendado (1x/dia)
  // Protegido por header `x-cron-secret` (env CRON_SECRET), mesmo padrão de /cron/parceiros/resumo-mensal.
  app.post('/cron/limpeza-execucoes', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) {
      return reply.status(401).send({ error: 'Não autorizado' })
    }

    let etapa = 'init'
    try {
      const url = process.env.SUPABASE_URL
      const key = process.env.SUPABASE_SECRET_KEY
      if (!url || !key) {
        return reply.status(500).send({ error: 'env faltando', tem_url: !!url, tem_key: !!key })
      }
      etapa = 'createClient'
      const sb = createClient(url, key)

      // Execuções/planos/PDF: pelo tempo de guarda. Tickets/tarefas: 3 meses fixos.
      etapa = 'execucoes';  const execucoes = await executarLimpezaExecucoes(sb)
      etapa = 'tickets';    const tickets = await executarLimpezaTickets(sb)
      etapa = 'tarefas';    const tarefas = await executarLimpezaTarefas(sb)
      return reply.send({ ok: true, execucoes, tickets, tarefas })
    } catch (e: any) {
      app.log.error(e)
      return reply.status(500).send({ error: e?.message ?? 'erro desconhecido', etapa, stack: e?.stack?.split('\n').slice(0, 5).join(' | ') })
    }
  })
}
