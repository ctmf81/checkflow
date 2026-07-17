// Web Push (PWA) — envio server-side com VAPID.
// Canal complementar ao WhatsApp/e-mail, disparado nos mesmos eventos.
// Precisa das envs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (e opcional VAPID_SUBJECT).
// Sem elas, enviarPush é no-op (retorna 0) — o resto das notificações segue.

import webpush from 'web-push'
import { SupabaseClient } from '@supabase/supabase-js'

let configurado: boolean | null = null
function configurar(): boolean {
  if (configurado !== null) return configurado
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@checkflow.digital'
  if (!pub || !priv) { configurado = false; return false }
  try {
    webpush.setVapidDetails(subject, pub, priv)
    configurado = true
  } catch (e) {
    console.error('[push] VAPID inválido:', (e as any)?.message)
    configurado = false
  }
  return configurado
}

export interface PushPayload {
  titulo: string
  corpo: string
  url?: string
  tag?: string
}

/**
 * Envia um push para todos os aparelhos inscritos dos usuários informados.
 * Remove inscrições expiradas (404/410). Retorna quantos envios tiveram sucesso.
 * Usa `sb` com service role (lê inscrições de qualquer usuário).
 */
export interface PushResultado {
  enviados: number
  inscricoes: number
  vapid_configurado: boolean
  erros: string[]
}

export async function enviarPush(
  sb: SupabaseClient,
  usuarioIds: string[],
  payload: PushPayload,
): Promise<PushResultado> {
  const vapid_configurado = configurar()
  if (!vapid_configurado) return { enviados: 0, inscricoes: 0, vapid_configurado: false, erros: ['VAPID não configurado'] }
  const ids = [...new Set(usuarioIds.filter(Boolean))]
  if (ids.length === 0) return { enviados: 0, inscricoes: 0, vapid_configurado, erros: [] }

  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('usuario_id', ids)
  if (!subs || subs.length === 0) return { enviados: 0, inscricoes: 0, vapid_configurado, erros: [] }

  const body = JSON.stringify({
    title: payload.titulo,
    body: payload.corpo,
    url: payload.url ?? '/',
    tag: payload.tag,
  })

  const expiradas: string[] = []
  const erros: string[] = []
  let enviados = 0
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      )
      enviados++
    } catch (err: any) {
      const code = err?.statusCode
      if (code === 404 || code === 410) expiradas.push(s.id)
      else {
        const msg = `${code ?? '?'}: ${err?.body || err?.message || 'erro'}`
        erros.push(msg)
        console.error('[push] falha ao enviar:', msg)
      }
    }
  }))

  if (expiradas.length) {
    await sb.from('push_subscriptions').delete().in('id', expiradas)
  }
  return { enviados, inscricoes: subs.length, vapid_configurado, erros }
}
