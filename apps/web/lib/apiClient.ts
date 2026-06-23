import { createClient } from '@/lib/supabase'

// Chamadas do NAVEGADOR para a API Fastify (apps/api). Anexa o JWT do usuário
// logado (Authorization: Bearer), exigido pelas rotas internas protegidas
// (notificações, WhatsApp, catálogo test-api). Ver apps/api/src/lib/apiAuth.ts.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await createClient().auth.getSession()
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  return fetch(`${API}${path}`, { ...init, headers })
}
