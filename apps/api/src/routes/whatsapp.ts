import { FastifyInstance } from 'fastify'
import { enviarWhatsApp, statusInstancia } from '../lib/whatsapp'

const EVO_URL = process.env.EVOLUTION_API_URL ?? 'https://evolution-api-production-d484.up.railway.app'
const EVO_KEY = process.env.EVOLUTION_API_KEY ?? 'checkflow_evo_key_2026'
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'checkflow'

export async function whatsappRoutes(app: FastifyInstance) {

  // POST /whatsapp/status — verifica se está conectado (aceita config via body)
  app.post('/whatsapp/status', async (req, reply) => {
    const body = (req.body ?? {}) as any
    const url = body.evoUrl || EVO_URL
    const key = body.evoKey || EVO_KEY
    const instance = body.evoInstance || EVO_INSTANCE
    try {
      const res = await fetch(`${url}/instance/fetchInstances`, {
        headers: { 'apikey': key },
      })
      if (!res.ok) return reply.send({ conectado: false })
      const json: any = await res.json()
      const inst = Array.isArray(json) ? json.find((i: any) => i.instance?.instanceName === instance) : null
      const conectado = inst?.instance?.state === 'open'
      return reply.send({ conectado })
    } catch {
      return reply.send({ conectado: false })
    }
  })

  // GET /whatsapp/status — mantém compatibilidade
  app.get('/whatsapp/status', async (req, reply) => {
    const status = await statusInstancia()
    return reply.send(status)
  })

  // POST /whatsapp/conectar — cria a instância e retorna QR Code
  app.post('/whatsapp/conectar', async (req, reply) => {
    try {
      const body = (req.body ?? {}) as any
      const url = body.evoUrl || EVO_URL
      const key = body.evoKey || EVO_KEY
      const instance = body.evoInstance || EVO_INSTANCE

      const headers = { 'Content-Type': 'application/json', 'apikey': key }

      function normalizeQr(raw: string | undefined): string | null {
        if (!raw) return null
        if (raw.startsWith('data:')) return raw
        return `data:image/png;base64,${raw}`
      }

      // Tenta criar a instância
      const criar = await fetch(`${url}/instance/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      })
      const criado: any = await criar.json()

      const qrDoCriar = normalizeQr(criado?.qrcode?.base64 ?? criado?.base64)
      if (qrDoCriar) {
        return reply.send({ qrcode: qrDoCriar, status: 'aguardando_scan' })
      }

      // Se instância já existe, desconecta para forçar novo QR
      const instanceState = criado?.response?.message ?? ''
      const jaExiste = criar.status === 409 || (typeof instanceState === 'string' && instanceState.includes('exists'))

      if (jaExiste) {
        await fetch(`${url}/instance/logout/${instance}`, { method: 'DELETE', headers })
      }

      // Chama connect para obter QR
      const qrRes = await fetch(`${url}/instance/connect/${instance}`, { headers })
      const qrJson: any = await qrRes.json()
      const qrDoConnect = normalizeQr(qrJson?.base64 ?? qrJson?.qrcode?.base64 ?? qrJson?.code)

      return reply.send({
        qrcode: qrDoConnect,
        status: 'aguardando_scan',
        _debug: process.env.NODE_ENV !== 'production' ? { url, instance, criado, qrJson } : undefined,
      })
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // POST /whatsapp/enviar — envia mensagem
  app.post('/whatsapp/enviar', async (req, reply) => {
    const { numero, mensagem } = req.body as { numero: string; mensagem: string }
    if (!numero || !mensagem) return reply.status(400).send({ error: 'numero e mensagem obrigatórios' })
    const result = await enviarWhatsApp({ numero, mensagem })
    return reply.send(result)
  })

  // POST /whatsapp/recuperar-senha — envia link de recuperação via WhatsApp
  app.post('/whatsapp/recuperar-senha', async (req, reply) => {
    const { numero, nome, link } = req.body as { numero: string; nome: string; link: string }
    if (!numero || !link) return reply.status(400).send({ error: 'numero e link obrigatórios' })

    const mensagem = `Olá${nome ? ` ${nome}` : ''}! 👋\n\nVocê solicitou a recuperação de senha do *CheckFlow*.\n\nClique no link abaixo para criar uma nova senha:\n${link}\n\n_Este link expira em 1 hora._`

    const result = await enviarWhatsApp({ numero, mensagem })
    return reply.send(result)
  })
}
