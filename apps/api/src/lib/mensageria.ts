/**
 * Camada de envio com fallback de canal.
 *
 * Por padrão tenta o WhatsApp (canal principal) e, se falhar — tipicamente por
 * bloqueio de conta — cai para o Telegram (se o destinatário o vinculou). Com
 * `preferirTelegram`, a ordem se inverte (Telegram primeiro, WhatsApp de
 * reserva) — para quem escolheu o Telegram como canal primário.
 *
 * Se houver `imagemUrl`, envia a evidência como mídia em ambos os canais
 * (WhatsApp sendMedia / Telegram sendPhoto), preservando a foto no fallback.
 */

import { enviarWhatsApp, enviarWhatsAppMidia } from './whatsapp'
import { enviarTelegram, enviarTelegramFoto } from './telegram'

export interface EnvioFallback {
  numero?: string | null          // telefone (WhatsApp)
  telegramChatId?: string | null  // chat id do Telegram (se vinculado)
  mensagem: string
  imagemUrl?: string | null       // evidência opcional (foto)
  preferirTelegram?: boolean      // canal primário = Telegram
}

type Resultado = { ok: boolean; canal?: 'whatsapp' | 'telegram'; erro?: string }

async function viaWhatsApp(numero: string, mensagem: string, imagemUrl?: string | null): Promise<boolean> {
  const r = imagemUrl
    ? await enviarWhatsAppMidia({ numero, imagemUrl, caption: mensagem })
    : await enviarWhatsApp({ numero, mensagem })
  return r.ok
}

async function viaTelegram(chatId: string, mensagem: string, imagemUrl?: string | null): Promise<boolean> {
  const r = imagemUrl
    ? await enviarTelegramFoto(chatId, imagemUrl, mensagem)
    : await enviarTelegram(chatId, mensagem)
  return r.ok
}

export async function enviarComFallback(
  { numero, telegramChatId, mensagem, imagemUrl, preferirTelegram }: EnvioFallback,
): Promise<Resultado> {
  // Monta a ordem dos canais conforme a preferência do usuário.
  const canais: ('whatsapp' | 'telegram')[] = preferirTelegram
    ? ['telegram', 'whatsapp']
    : ['whatsapp', 'telegram']

  for (const canal of canais) {
    if (canal === 'whatsapp' && numero) {
      if (await viaWhatsApp(numero, mensagem, imagemUrl)) return { ok: true, canal: 'whatsapp' }
    }
    if (canal === 'telegram' && telegramChatId) {
      if (await viaTelegram(telegramChatId, mensagem, imagemUrl)) return { ok: true, canal: 'telegram' }
    }
  }
  return { ok: false, erro: 'sem canal disponível ou todos falharam' }
}
