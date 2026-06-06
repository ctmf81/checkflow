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

      async function criarEObterQR() {
        const res = await fetch(`${url}/instance/create`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
        })
        const json: any = await res.json()
        return { res, json }
      }

      // 1ª tentativa: criar instância
      let { res: criarRes, json: criado } = await criarEObterQR()

      const qrDoCriar = normalizeQr(criado?.qrcode?.base64 ?? criado?.base64)
      if (qrDoCriar) {
        return reply.send({ qrcode: qrDoCriar, status: 'aguardando_scan' })
      }

      // Verifica se a instância já existe (403 "already in use" ou 409)
      const mensagens: string[] = [].concat(criado?.response?.message ?? criado?.message ?? [])
      const jaExiste =
        criarRes.status === 409 ||
        criarRes.status === 403 ||
        mensagens.some((m: string) => m.toLowerCase().includes('already') || m.toLowerCase().includes('exists'))

      const debugSteps: any = { passo1_criar: { status: criarRes.status, body: criado } }

      if (jaExiste) {
        // Passo 2: logout (desconecta sessão WhatsApp ativa)
        const logoutRes = await fetch(`${url}/instance/logout/${instance}`, { method: 'DELETE', headers })
        debugSteps.passo2_logout = { status: logoutRes.status }
        await new Promise(r => setTimeout(r, 1500))

        // Passo 3: deleta a instância
        const delRes = await fetch(`${url}/instance/delete/${instance}`, { method: 'DELETE', headers })
        debugSteps.passo3_delete = { status: delRes.status, body: await delRes.json().catch(() => null) }
        await new Promise(r => setTimeout(r, 2000))

        // Passo 4: recria do zero
        const { res: recriarRes, json: recriado } = await criarEObterQR()
        debugSteps.passo4_recriar = { status: recriarRes.status, body: recriado }

        const qrRecriar = normalizeQr(recriado?.qrcode?.base64 ?? recriado?.base64)
        if (qrRecriar) {
          return reply.send({ qrcode: qrRecriar, status: 'aguardando_scan' })
        }
        criado = recriado
      }

      // Aguarda a instância gerar o QR — tenta até 8x via fetchInstances
      let qrJson: any = null
      let qrDoConnect: string | null = null
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 2000))

        // Busca o QR via fetchInstances (mais confiável que /connect nessa versão)
        const fetchRes = await fetch(`${url}/instance/fetchInstances?instanceName=${instance}`, { headers })
        const fetchJson: any = await fetchRes.json()
        const inst = Array.isArray(fetchJson) ? fetchJson[0] : fetchJson
        debugSteps[`passo_poll_${i + 1}`] = {
          status: fetchRes.status,
          instanceState: inst?.instance?.state,
          hasQr: !!inst?.qrcode?.base64,
        }
        qrDoConnect = normalizeQr(inst?.qrcode?.base64 ?? inst?.base64)
        if (qrDoConnect) { qrJson = inst; break }
      }

      return reply.send({
        qrcode: qrDoConnect,
        status: 'aguardando_scan',
        _debug: { url, instance, ...debugSteps },
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
