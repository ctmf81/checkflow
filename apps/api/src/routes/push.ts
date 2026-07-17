import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { enviarPush, diagnosticoVapid } from '../lib/push'

// Rota de teste/diagnóstico do Web Push. Envia um push para o próprio usuário
// logado e devolve o estado do pipeline (VAPID configurado? inscrições? erro?).
// Não depende do fluxo de eventos (ticket/plano/tarefa) — isola o envio.

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export async function pushRoutes(app: FastifyInstance) {
  // Diagnóstico SEM login (temporário): só presença/tamanho das chaves — nunca
  // o valor. Serve para inspecionar o processo que realmente atende HTTP.
  app.get('/push/diag', async (_req, reply) => {
    return reply.send(diagnosticoVapid())
  })

  // Diagnóstico de ENVIO sem login (temporário): dispara um push de teste para
  // TODAS as inscrições existentes e devolve o resultado. Remover após validar.
  app.post('/push/diag-send', async (_req, reply) => {
    const sb = createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: false }, realtime: { transport: ws as any },
    })
    const { data: subs } = await sb.from('push_subscriptions').select('usuario_id')
    const ids = [...new Set((subs ?? []).map((s: any) => s.usuario_id))]
    const r = await enviarPush(sb, ids, {
      titulo: 'CheckFlow — teste',
      corpo: 'Teste de diagnóstico do push 🎉',
      url: '/operacao', tag: 'teste',
    })
    return reply.send({ total_subs: subs?.length ?? 0, usuarios: ids.length, ...r })
  })

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
      diag: diagnosticoVapid(),
    })
  })
}
