import { FastifyInstance } from 'fastify'
import { enviarWhatsApp, statusInstancia } from '../lib/whatsapp'

const EVO_URL = process.env.EVOLUTION_API_URL ?? 'https://evolution-api-production-d484.up.railway.app'
const EVO_KEY = process.env.EVOLUTION_API_KEY ?? 'checkflow_evo_key_2026'
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'checkflow'

export async function whatsappRoutes(app: FastifyInstance) {

  // GET /whatsapp/status — verifica se está conectado
  app.get('/whatsapp/status', async (req, reply) => {
    const status = await statusInstancia()
    return reply.send(status)
  })

  // POST /whatsapp/conectar — cria a instância e retorna QR Code
  app.post('/whatsapp/conectar', async (req, reply) => {
    try {
      // Cria instância se não existir
      const criar = await fetch(`${EVO_URL}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
        body: JSON.stringify({
          instanceName: EVO_INSTANCE,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      })
      const json: any = await criar.json()

      if (json?.qrcode?.base64 || json?.base64) {
        return reply.send({
          qrcode: json?.qrcode?.base64 ?? json?.base64,
          status: 'aguardando_scan',
        })
      }

      // Busca QR code da instância existente
      const qr = await fetch(`${EVO_URL}/instance/connect/${EVO_INSTANCE}`, {
        headers: { 'apikey': EVO_KEY },
      })
      const qrJson: any = await qr.json()
      return reply.send({
        qrcode: qrJson?.base64 ?? qrJson?.qrcode?.base64,
        status: 'aguardando_scan',
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
