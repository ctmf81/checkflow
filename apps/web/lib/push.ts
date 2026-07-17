// Web Push (PWA) — cliente. Inscreve/desinscreve o aparelho e persiste a
// inscrição em push_subscriptions (RLS: usuário gerencia as suas).
// A chave pública VAPID vem de NEXT_PUBLIC_VAPID_PUBLIC_KEY (env do serviço web).

import { createClient } from '@/lib/supabase'

// Chave PÚBLICA VAPID. Não é segredo (vai para todo navegador). Fallback
// hardcoded porque o build via Dockerfile no Railway NÃO injeta as
// NEXT_PUBLIC_* (mesmo padrão de lib/supabase.ts). Deve corresponder à
// VAPID_PRIVATE_KEY configurada no serviço API. Se rotacionar as chaves,
// atualizar aqui E no env da API.
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  || 'BCxTgNq-6NyeeEC-J02huW2uWjWPgDXMtmvIyN8hX3CQEk8A-fDJFrIBk26i3JkLS1XuY47Gp6auHI2QU9AyooY'

export function pushSuportado(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function pushConfigurado(): boolean {
  return !!VAPID_PUBLIC
}

export function permissaoAtual(): NotificationPermission | 'indisponivel' {
  if (!pushSuportado()) return 'indisponivel'
  return Notification.permission
}

/** PWA instalado (standalone)? Push no iOS só funciona instalado. */
export function ehStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as any).standalone === true
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function estaInscrito(): Promise<boolean> {
  if (!pushSuportado()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

export async function inscrever(): Promise<{ ok: boolean; motivo?: string }> {
  if (!pushSuportado()) return { ok: false, motivo: 'Notificações não são suportadas neste navegador.' }
  if (!VAPID_PUBLIC) return { ok: false, motivo: 'Notificações push não configuradas no servidor.' }

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, motivo: 'Permissão de notificação negada.' }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as unknown as BufferSource,
    })
  }

  const json = sub.toJSON()
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, motivo: 'Sessão expirada. Entre novamente.' }

  const { error } = await sb.from('push_subscriptions').upsert({
    usuario_id: user.id,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent.slice(0, 300),
  }, { onConflict: 'endpoint' })

  if (error) return { ok: false, motivo: 'Não foi possível salvar a inscrição.' }
  return { ok: true }
}

export async function desinscrever(): Promise<void> {
  if (!pushSuportado()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    const sb = createClient()
    await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } catch {
    /* noop */
  }
}
