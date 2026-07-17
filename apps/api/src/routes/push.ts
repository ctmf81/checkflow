import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { enviarPush } from '../lib/push'

// Rota de teste/diagnóstico do Web Push. Envia um push para o próprio usuário
// logado e devolve o estado do pipeline (VAPID configurado? inscrições? erro?).
// Não depende do fluxo de eventos (ticket/plano/tarefa) — isola o envio.

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export async function pushRoutes(app: FastifyInstance) {
  app.post('/push/testar', async (req, reply) => {
    const token = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return reply.status(401).send({ error: 'Não autorizado' })

    const sb = createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: false }, realtime: { transport: ws as any },
    })
    const { data: { user } } = await sb.auth.getUser(token)
    if (!user) return reply.status(401).send({ error: 'Sessão inválida' })

    const r = await enviarPush(sb, [user.id], {
      titulo: 'CheckFlow — teste',
      corpo: 'Se você viu isto, as notificações estão funcionando! 🎉',
      url: '/operacao',
      tag: 'teste',
    })

    return reply.send({
      vapid_configurado: r.vapid_configurado,
      inscricoes: r.inscricoes,
      enviados: r.enviados,
      erros: r.erros,
    })
  })
}
