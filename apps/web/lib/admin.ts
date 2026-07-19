// Detecção de "admin" para fins de visibilidade na UI.
//
// Um admin de SISTEMA (JWT role) enxerga tudo. Um admin da EMPRESA
// (perfil_id ...002 em usuario_empresa) tem as mesmas funções, porém
// restritas à sua empresa — então, dentro da empresa ativa, também
// "vê tudo" (ignora o filtro por subgrupo nas telas operacionais).
//
// Use `ehAdminDaEmpresa(supabase, empresaId)` nas telas que hoje
// checam apenas `app_metadata.role === 'admin_sistema'`.
//
// ⚠️ O role vive em `app_metadata`, NUNCA em `user_metadata`: este último é
// gravável pelo próprio usuário via `auth.updateUser({ data })` e permitiria
// auto-promoção a admin de plataforma (corrigido em 20260718160000).

import type { SupabaseClient } from '@supabase/supabase-js'

export const PERFIL_ADMIN_EMPRESA = '00000000-0000-0000-0000-000000000002'
export const PERFIL_ADMIN_SISTEMA = '00000000-0000-0000-0000-000000000001'

/** True se o usuário logado é admin de sistema. */
export function ehAdminSistema(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.role === 'admin_sistema'
}

/**
 * True se o usuário logado é admin de sistema OU admin da empresa informada.
 * Use para o bypass de "vê tudo" dentro da empresa ativa.
 */
export async function ehAdminDaEmpresa(
  supabase: SupabaseClient,
  empresaId: string | null | undefined,
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  if (ehAdminSistema(user)) return true
  if (!empresaId) return false
  const { data } = await supabase
    .from('usuario_empresa')
    .select('perfil_id')
    .eq('usuario_id', user.id)
    .eq('empresa_id', empresaId)
    .maybeSingle()
  return data?.perfil_id === PERFIL_ADMIN_EMPRESA
}
