import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
// Rotas de inscrição do Web Push (registro/baixa da inscrição do aparelho).

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

async function usuarioDoToken(req: any) {
  const token = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false }, realtime: { transport: ws as any } })
  const { data: { user } } = await sb.auth.getUser(token)
  return user ? { user, sb } : null
}

export async function pushRoutes(app: FastifyInstance) {
  // Registra/atualiza a inscrição do aparelho SOB O USUÁRIO LOGADO. Reatribui o
  // endpoint (device) a quem está logado agora — service role, então funciona
  // mesmo que o endpoint pertencesse a outro usuário (troca de login no mesmo
  // aparelho). Idempotente.
  app.post('/push/subscribe', async (req, reply) => {
    const ctx = await usuarioDoToken(req)
    if (!ctx) return reply.status(401).send({ error: 'Não autorizado' })
    const b = (req.body ?? {}) as any
    if (!b.endpoint || !b.p256dh || !b.auth) return reply.status(400).send({ error: 'Inscrição incompleta' })
    await ctx.sb.from('push_subscriptions').delete().eq('endpoint', b.endpoint)
    const { error } = await ctx.sb.from('push_subscriptions').insert({
      usuario_id: ctx.user.id, endpoint: b.endpoint, p256dh: b.p256dh, auth: b.auth,
      user_agent: String(b.user_agent ?? '').slice(0, 300),
    })
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ ok: true })
  })

  app.post('/push/unsubscribe', async (req, reply) => {
    const ctx = await usuarioDoToken(req)
    if (!ctx) return reply.status(401).send({ error: 'Não autorizado' })
    const b = (req.body ?? {}) as any
    if (b.endpoint) await ctx.sb.from('push_subscriptions').delete().eq('endpoint', b.endpoint)
    return reply.send({ ok: true })
  })
}
