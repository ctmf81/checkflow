import { createClient } from '@supabase/supabase-js'

// Autorização para Route Handlers (Next.js) que rodam com service-role.
// Exige Bearer do usuário + ser admin de sistema OU ter a permissão
// (recurso/ação) — mesmo modelo de /api/usuarios/resetar-senha.
// Sem isto, a rota executaria ação privilegiada sem autenticar o chamador.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_PUBLISHABLE =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SUPABASE_SECRET =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''

export type AutorizacaoResultado =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }

export async function autorizarPermissao(
  req: Request,
  recurso: string,
  acao: string,
): Promise<AutorizacaoResultado> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, message: 'Não autorizado.' }

  const caller = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE || SUPABASE_SECRET, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error } = await caller.auth.getUser(token)
  if (error || !user) return { ok: false, status: 401, message: 'Sessão inválida. Faça login novamente.' }

  if (user.user_metadata?.role === 'admin_sistema') return { ok: true, userId: user.id }

  const { data: temPermissao } = await caller.rpc('usuario_tem_permissao', { p_recurso: recurso, p_acao: acao })
  if (!temPermissao) return { ok: false, status: 403, message: 'Você não tem permissão para esta ação.' }
  return { ok: true, userId: user.id }
}
