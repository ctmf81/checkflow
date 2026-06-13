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

/**
 * Resolve o número de celular brasileiro para o JID real cadastrado no WhatsApp.
 * Baileys pode remover o 9º dígito ao montar o JID, gerando um número que não
 * existe no WhatsApp (mensagem fica em "PENDING" e nunca é entregue). Aqui
 * perguntamos à Evolution API qual variante (com ou sem o 9) está registrada.
 */
async function resolverNumero(numero: string): Promise<{ numero: string; debugResolver?: string }> {
  try {
    const res = await fetch(`${EVO_URL}/chat/whatsappNumbers/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
      body: JSON.stringify({ numbers: [numero] }),
    })
    const body = await res.text()
    if (!res.ok) return { numero, debugResolver: `HTTP ${res.status}: ${body}` }
    const json: any = JSON.parse(body)
    const item = Array.isArray(json) ? json[0] : json
    if (item?.exists && item?.jid) {
      return { numero: String(item.jid).replace('@s.whatsapp.net', ''), debugResolver: body }
    }
    return { numero, debugResolver: body }
  } catch (e: any) {
    return { numero, debugResolver: `EXCEPTION: ${e.message}` }
  }
}

export async function enviarWhatsApp({ numero, mensagem }: WhatsAppMessage): Promise<{ ok: boolean; erro?: string; raw?: string; debugResolver?: string; numeroResolvido?: string }> {
  try {
    const { numero: numeroResolvido, debugResolver } = await resolverNumero(numero)

    const res = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVO_KEY,
      },
      body: JSON.stringify({
        number: numeroResolvido,
        text: mensagem,
      }),
    })

    const body = await res.text()

    if (!res.ok) {
      return { ok: false, erro: body, debugResolver, numeroResolvido }
    }

    return { ok: true, raw: body, debugResolver, numeroResolvido }
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
