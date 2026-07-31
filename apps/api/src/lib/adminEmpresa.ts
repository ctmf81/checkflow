import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarTelegram } from './telegram'

// Helpers de notificação ao(s) admin(s) da empresa (perfil …002). O mesmo
// padrão se repetia em avisos-trial e avisos-uso; aqui fica a versão única
// reusada pelo código novo (Fases 2-3 dos alertas de gestão).

const PERFIL_ADMIN_EMPRESA = '00000000-0000-0000-0000-000000000002'

export interface AdminContato { nome: string; email: string | null; telefone: string | null; telegram_chat_id?: string | null }

/** Admins (perfil …002) vinculados à empresa, com contato. */
export async function buscarAdminsEmpresa(sb: SupabaseClient, empresaId: string): Promise<AdminContato[]> {
  const { data } = await sb.from('usuario_empresa')
    .select('usuarios(nome, email, telefone, telegram_chat_id)')
    .eq('empresa_id', empresaId).eq('perfil_id', PERFIL_ADMIN_EMPRESA)
  return (data ?? []).map((v: any) => v.usuarios).filter(Boolean)
}

/** Prefixa DDI 55 quando ausente (Evolution exige o país). */
export function formatarNumeroBR(tel: string): string {
  const n = tel.replace(/\D/g, '').replace(/^0/, '')
  return n.startsWith('55') ? n : `55${n}`
}

type EnviarWhats = (a: { numero: string; mensagem: string }) => Promise<{ ok: boolean }>
type EnviarEmail = (a: { para: string; assunto: string; html: string }) => Promise<{ ok: boolean }>

/**
 * Envia WhatsApp + e-mail a todos os admins. Builders recebem cada admin (para
 * personalizar nome). Ignora e-mail técnico `@checkflow.local` (não entregável).
 * Retorna se algum canal saiu e se havia algum contato — o chamador usa isso
 * para decidir a idempotência (marca como avisado se enviou OU se não havia
 * contato, evitando reprocessar sempre a empresa sem telefone/e-mail).
 */
export async function notificarAdmins(
  admins: AdminContato[],
  msgWa: (adm: AdminContato) => string,
  msgEmail: (adm: AdminContato) => { assunto: string; html: string },
  enviarWhatsApp: EnviarWhats,
  enviarEmail: EnviarEmail,
): Promise<{ algumEnviado: boolean; tinhaContato: boolean }> {
  let algumEnviado = false
  let tinhaContato = false
  for (const adm of admins) {
    if (adm.telefone || adm.telegram_chat_id) {
      tinhaContato = true
      let ok = false
      if (adm.telefone) ok = (await enviarWhatsApp({ numero: formatarNumeroBR(adm.telefone), mensagem: msgWa(adm) })).ok
      // Fallback: se o WhatsApp não saiu e o admin tem Telegram, envia por lá.
      if (!ok && adm.telegram_chat_id) ok = (await enviarTelegram(adm.telegram_chat_id, msgWa(adm))).ok
      if (ok) algumEnviado = true
    }
    if (adm.email && !adm.email.endsWith('@checkflow.local')) {
      tinhaContato = true
      const { assunto, html } = msgEmail(adm)
      const { ok } = await enviarEmail({ para: adm.email, assunto, html })
      if (ok) algumEnviado = true
    }
  }
  return { algumEnviado, tinhaContato }
}
