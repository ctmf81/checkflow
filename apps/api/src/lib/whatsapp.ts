/**
 * Cliente para a Evolution API (WhatsApp)
 */

// URL e nome da instância não são segredos — mantêm default de conveniência.
// A API key é secreta e vem SEMPRE do ambiente (sem fallback hardcoded).
const EVO_URL = process.env.EVOLUTION_API_URL ?? 'https://evolution-api-production-d484.up.railway.app'
const EVO_KEY = process.env.EVOLUTION_API_KEY ?? ''
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'checkflow'

export interface WhatsAppMessage {
  numero: string  // ex: '5511999999999' (sem + ou espaços)
  mensagem: string
}

export async function enviarWhatsApp({ numero, mensagem }: WhatsAppMessage): Promise<{ ok: boolean; erro?: string; raw?: string }> {
  try {
    const res = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVO_KEY,
      },
      body: JSON.stringify({
        number: numero,
        text: mensagem,
      }),
    })

    const body = await res.text()

    if (!res.ok) {
      return { ok: false, erro: body }
    }

    return { ok: true, raw: body }
  } catch (e: any) {
    return { ok: false, erro: e.message }
  }
}

/**
 * Envia imagem com legenda (caption).
 * Se falhar, tenta enviar só o texto como fallback.
 */
export async function enviarWhatsAppMidia({
  numero, imagemUrl, caption,
}: {
  numero: string
  imagemUrl: string
  caption: string
}): Promise<{ ok: boolean; erro?: string }> {
  try {
    const res = await fetch(`${EVO_URL}/message/sendMedia/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({
        number: numero,
        mediatype: 'image',
        mimetype: 'image/jpeg',
        media: imagemUrl,
        caption,
        fileName: 'evidencia.jpg',
      }),
    })
    if (!res.ok) {
      // Fallback: envia só texto
      return enviarWhatsApp({ numero, mensagem: caption })
    }
    return { ok: true }
  } catch (e: any) {
    // Fallback: envia só texto
    return enviarWhatsApp({ numero, mensagem: caption })
  }
}

export async function statusInstancia(): Promise<{ conectado: boolean; estado?: string }> {
  try {
    const res = await fetch(`${EVO_URL}/instance/connectionState/${EVO_INSTANCE}`, {
      headers: { 'apikey': EVO_KEY },
    })
    const json: any = await res.json()
    const estado = json?.instance?.state ?? json?.state
    return { conectado: estado === 'open', estado }
  } catch {
    return { conectado: false }
  }
}
