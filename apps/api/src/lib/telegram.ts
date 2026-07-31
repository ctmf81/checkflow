/**
 * Cliente do Telegram Bot API — canal alternativo de mensageria.
 *
 * Diferente do WhatsApp, o bot só envia mensagem para quem já iniciou conversa
 * com ele (deu /start). Guardamos o `telegram_chat_id` de cada usuário
 * (preenchido pelo webhook) e enviamos por ele.
 *
 * O token é SECRETO e vem sempre do ambiente (sem fallback hardcoded). O
 * @username do bot é público (usado no deep link) e tem default de conveniência.
 */

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
// @username do bot (sem @). Público — usado no deep link t.me/<user>?start=<code>.
export const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? 'checkflows_bot'

const API = (metodo: string) => `https://api.telegram.org/bot${TG_TOKEN}/${metodo}`

/** True se o token do bot está configurado (sem ele, o canal fica inativo). */
export function telegramConfigurado(): boolean {
  return TG_TOKEN.length > 0
}

/** Deep link de vínculo: abre o bot já com o código do usuário no /start. */
export function linkVinculo(code: string): string {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}`
}

/**
 * Envia uma mensagem de texto para um chat do Telegram.
 * Retorna { ok, erro } no mesmo formato do enviarWhatsApp.
 */
export async function enviarTelegram(
  chatId: string,
  mensagem: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!TG_TOKEN) return { ok: false, erro: 'TELEGRAM_BOT_TOKEN ausente' }
  try {
    const res = await fetch(API('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: mensagem, disable_web_page_preview: true }),
    })
    if (!res.ok) return { ok: false, erro: await res.text() }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: e?.message ?? 'erro desconhecido' }
  }
}

/**
 * Registra a URL do webhook no Telegram (chamado uma vez no deploy/setup).
 * `webhookUrl` deve ser HTTPS público — ex.: https://api-.../telegram/webhook.
 * Um `secretToken` opcional é devolvido pelo Telegram no header
 * X-Telegram-Bot-Api-Secret-Token de cada update, para autenticar o webhook.
 */
export async function configurarWebhook(
  webhookUrl: string,
  secretToken?: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!TG_TOKEN) return { ok: false, erro: 'TELEGRAM_BOT_TOKEN ausente' }
  try {
    const res = await fetch(API('setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken || undefined,
        allowed_updates: ['message'],
      }),
    })
    const json: any = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, erro: JSON.stringify(json) }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: e?.message ?? 'erro desconhecido' }
  }
}
