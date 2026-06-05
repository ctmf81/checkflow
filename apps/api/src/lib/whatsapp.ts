/**
 * Cliente para a Evolution API (WhatsApp)
 */

const EVO_URL = process.env.EVOLUTION_API_URL ?? 'https://evolution-api-production-d484.up.railway.app'
const EVO_KEY = process.env.EVOLUTION_API_KEY ?? 'checkflow_evo_key_2026'
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'checkflow'

export interface WhatsAppMessage {
  numero: string  // ex: '5511999999999' (sem + ou espaços)
  mensagem: string
}

export async function enviarWhatsApp({ numero, mensagem }: WhatsAppMessage): Promise<{ ok: boolean; erro?: string }> {
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

    if (!res.ok) {
      const err = await res.text()
      return { ok: false, erro: err }
    }

    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: e.message }
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
