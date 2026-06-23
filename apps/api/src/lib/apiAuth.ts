import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { FastifyRequest } from 'fastify'

// Guard das rotas "internas" da API (notificações, WhatsApp, test-api de catálogo).
// Antes eram chamáveis por qualquer um direto na URL (a CORS só barra navegador,
// não curl/server). Agora exigem credencial:
//   • x-internal-secret  → chamadas servidor-a-servidor (ex.: OTP de reset, crons)
//   • Authorization: Bearer <jwt>  → chamadas do navegador (usuário logado)
//
// ⚠️ INTERNAL_API_SECRET precisa estar setado no serviço API E no web (server-side).

const SUPA_URL = process.env.SUPABASE_URL ?? ''
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const supa = SUPA_URL && SUPA_KEY
  ? createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false }, realtime: { transport: ws as any } })
  : null

export async function requisicaoAutorizada(req: FastifyRequest): Promise<boolean> {
  // 1) Segredo interno (servidor-a-servidor)
  const secret = process.env.INTERNAL_API_SECRET
  if (secret && req.headers['x-internal-secret'] === secret) return true

  // 2) JWT de usuário autenticado (navegador)
  const token = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim()
  if (token && supa) {
    const { data: { user } } = await supa.auth.getUser(token)
    if (user) return true
  }
  return false
}

/** Helper de conveniência: responde 401 e retorna false se não autorizado. */
export async function exigirAutorizacao(req: FastifyRequest, reply: { status: (n: number) => { send: (b: any) => any } }): Promise<boolean> {
  if (await requisicaoAutorizada(req)) return true
  reply.status(401).send({ error: 'Não autorizado' })
  return false
}
