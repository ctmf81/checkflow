import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { enviarPush, diagnosticoVapid } from '../lib/push'

// Rota de teste/diagnóstico do Web Push. Envia um push para o próprio usuário
// logado e devolve o estado do pipeline (VAPID configurado? inscrições? erro?).
// Não depende do fluxo de eventos (ticket/plano/tarefa) — isola o envio.

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

  // Diagnóstico SEM login (temporário): só presença/tamanho das chaves — nunca
  // o valor. Serve para inspecionar o processo que realmente atende HTTP.
  app.get('/push/diag', async (_req, reply) => {
    return reply.send(diagnosticoVapid())
  })

  // Lista as inscrições (nome + dispositivo + quando) — temporário p/ diagnóstico.
  app.get('/push/diag-list', async (_req, reply) => {
    const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false }, realtime: { transport: ws as any } })
    const { data } = await sb.from('push_subscriptions').select('usuario_id, criado_em, user_agent, usuarios(nome)')
    return reply.send((data ?? []).map((s: any) => ({
      nome: (Array.isArray(s.usuarios) ? s.usuarios[0] : s.usuarios)?.nome ?? '?',
      usuario_id: s.usuario_id,
      criado_em: s.criado_em,
      ua: String(s.user_agent ?? '').slice(0, 50),
    })))
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
