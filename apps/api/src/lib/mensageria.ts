/**
 * Camada de envio com fallback de canal.
 *
 * Tenta o WhatsApp primeiro (canal principal); se ele falhar — tipicamente por
 * bloqueio de conta — e o destinatário tiver o Telegram vinculado, cai para o
 * Telegram. Os fluxos de notificação (planos de ação, tarefas, tickets, avisos)
 * devem usar esta função em vez de chamar enviarWhatsApp diretamente, passando
 * também o telegram_chat_id do destinatário quando houver.
 */

import { enviarWhatsApp } from './whatsapp'
import { enviarTelegram } from './telegram'

export interface EnvioFallback {
  numero?: string | null          // telefone (WhatsApp)
  telegramChatId?: string | null  // chat id do Telegram (se vinculado)
  mensagem: string
}

export async function enviarComFallback(
  { numero, telegramChatId, mensagem }: EnvioFallback,
): Promise<{ ok: boolean; canal?: 'whatsapp' | 'telegram'; erro?: string }> {
  let erro: string | undefined

  // 1. WhatsApp (canal principal), se houver número.
  if (numero) {
    const wa = await enviarWhatsApp({ numero, mensagem })
    if (wa.ok) return { ok: true, canal: 'whatsapp' }
    erro = wa.erro
  }

  // 2. Telegram (fallback), se o usuário vinculou.
  if (telegramChatId) {
    const tg = await enviarTelegram(telegramChatId, mensagem)
    if (tg.ok) return { ok: true, canal: 'telegram' }
    erro = tg.erro ?? erro
  }

  return { ok: false, erro: erro ?? 'sem canal disponível' }
}
