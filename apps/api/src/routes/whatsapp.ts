import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { enviarWhatsApp, statusInstancia } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { buscarTemplate, renderizar } from '../lib/notificacao-templates'
import { exigirAutorizacao } from '../lib/apiAuth'
import { adicionarAlerta } from './alerts'

// Último estado conhecido do WhatsApp (em memória) — usado pelo healthcheck
// para só alertar na MUDANÇA de estado (evita spam a cada checagem).
let ultimoWhatsappOk: boolean | null = null

// Avisa o admin por e-mail (canal independente do WhatsApp — funciona mesmo
// com o WhatsApp fora). Destinatário em ALERT_EMAIL; sem ele, não envia.
async function notificarAlertaEmail(assunto: string, texto: string): Promise<void> {
  const para = process.env.ALERT_EMAIL
  if (!para) return
  const html = `<div style="font-family:Arial,sans-serif;padding:24px;max-width:520px;margin:auto">
    <h2 style="color:#f97316;margin:0 0 12px">CheckFlow — Monitoramento</h2>
    <p style="font-size:14px;color:#374151;line-height:1.6">${texto}</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">Alerta automático do healthcheck do WhatsApp.</p>
  </div>`
  await enviarEmail({ para, assunto, html }).catch(() => null)
}

// URL e instância têm default de conveniência; a API key (secreta) vem só do ambiente.
const EVO_URL = process.env.EVOLUTION_API_URL ?? 'https://evolution-api-production-d484.up.railway.app'
const EVO_KEY = process.env.EVOLUTION_API_KEY ?? ''
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'checkflow'

export async function whatsappRoutes(app: FastifyInstance) {

  // POST /whatsapp/status — verifica se está conectado (aceita config via body)
  app.post('/whatsapp/status', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
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
      const inst = Array.isArray(json) ? json.find((i: any) => i.name === instance || i.instance?.instanceName === instance) : null
      const conectado = inst?.connectionStatus === 'open' || inst?.instance?.state === 'open'
      return reply.send({ conectado })
    } catch {
      return reply.send({ conectado: false })
    }
  })

  // GET /whatsapp/status — mantém compatibilidade
  app.get('/whatsapp/status', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    const status = await statusInstancia()
    return reply.send(status)
  })

  // POST /cron/whatsapp/health — healthcheck do WhatsApp (chamado pelo cron-job.org
  // a cada ~15min, header x-cron-secret). Na MUDANÇA de estado, cria alerta no
  // painel + avisa o admin por e-mail. Detecta desconexão (estado != open);
  // não detecta "sessão zumbi" (open mas sem entregar) — limitação do Baileys.
  app.post('/cron/whatsapp/health', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) return reply.status(401).send({ error: 'não autorizado' })

    const status = await statusInstancia()
    const ok = status.conectado
    const mudou = ultimoWhatsappOk !== null && ultimoWhatsappOk !== ok
    const caiuPrimeiraVez = ultimoWhatsappOk === null && !ok

    if (!ok && (mudou || caiuPrimeiraVez)) {
      adicionarAlerta({
        id: `whatsapp-down-${Date.now()}`, alert_type: 'whatsapp', severity: 'critical', service: 'evolution',
        message: `WhatsApp desconectado (estado: ${status.estado ?? 'desconhecido'}). Reconecte o QR em Sistema → WhatsApp.`,
      })
      await notificarAlertaEmail(
        '🔴 WhatsApp do CheckFlow caiu',
        `O WhatsApp (Evolution) está <b>desconectado</b> (estado: ${status.estado ?? '—'}). Enquanto isso, códigos de acesso/reset NÃO chegam por WhatsApp. Reconecte escaneando o QR em <b>Sistema → WhatsApp</b>.`
      )
    } else if (ok && mudou) {
      adicionarAlerta({
        id: `whatsapp-up-${Date.now()}`, alert_type: 'whatsapp', severity: 'warning', service: 'evolution',
        message: 'WhatsApp reconectado e operacional.',
      })
      await notificarAlertaEmail('🟢 WhatsApp do CheckFlow voltou', 'O WhatsApp (Evolution) reconectou e está operacional novamente.')
    }

    ultimoWhatsappOk = ok
    return reply.send({ conectado: ok, estado: status.estado, alertou: !ok && (mudou || caiuPrimeiraVez) })
  })

  // POST /whatsapp/desconectar — encerra a sessão atual (troca de número):
  // faz logout da instância sem deletá-la; a tela volta a oferecer o QR.
  app.post('/whatsapp/desconectar', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    const body = (req.body ?? {}) as any
    const url = body.evoUrl || EVO_URL
    const key = body.evoKey || EVO_KEY
    const instance = body.evoInstance || EVO_INSTANCE
    try {
      const res = await fetch(`${url}/instance/logout/${instance}`, {
        method: 'DELETE',
        headers: { 'apikey': key },
      })
      const json: any = await res.json().catch(() => null)
      if (!res.ok) {
        return reply.status(502).send({ ok: false, error: json?.response?.message ?? json?.message ?? `HTTP ${res.status}` })
      }
      return reply.send({ ok: true })
    } catch (e: any) {
      return reply.status(502).send({ ok: false, error: e.message })
    }
  })

  // POST /whatsapp/conectar — cria a instância e retorna QR Code
  app.post('/whatsapp/conectar', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
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

      // Aguarda a instância gerar o QR via GET /instance/connect — tenta até 10x
      let qrDoConnect: string | null = null
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000))

        const connectRes = await fetch(`${url}/instance/connect/${instance}`, { headers })
        const connectJson: any = await connectRes.json()

        // v2: { code, pairingCode, count } — "code" é o QR em base64 ou string raw
        const rawCode = connectJson?.code ?? connectJson?.base64 ?? connectJson?.qrcode?.base64
        debugSteps[`passo_poll_${i + 1}`] = {
          status: connectRes.status,
          count: connectJson?.count,
          hasCode: !!rawCode,
          raw: i === 0 ? connectJson : undefined,
        }

        if (rawCode) {
          // Se for base64 puro de imagem PNG
          if (rawCode.startsWith('data:') || rawCode.startsWith('iVBOR') || rawCode.length > 200) {
            qrDoConnect = normalizeQr(rawCode)
          } else {
            // É uma string de conexão WhatsApp — retorna como texto para o front gerar o QR
            qrDoConnect = `qrstring:${rawCode}`
          }
          break
        }
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
    if (!await exigirAutorizacao(req, reply)) return
    const { numero, mensagem } = req.body as { numero: string; mensagem: string }
    if (!numero || !mensagem) return reply.status(400).send({ error: 'numero e mensagem obrigatórios' })
    const result = await enviarWhatsApp({ numero, mensagem })
    return reply.send(result)
  })

  // POST /whatsapp/recuperar-senha — envia link de recuperação via WhatsApp + Email
  app.post('/whatsapp/recuperar-senha', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    const { numero, nome, link, email, empresa_id } = req.body as {
      numero?: string; nome: string; link: string; email?: string; empresa_id?: string
    }
    if (!link) return reply.status(400).send({ error: 'link é obrigatório' })

    const vars = {
      nome,
      linha_nome: nome ? ` ${nome}` : '',
      link,
    }

    const sb = empresa_id
      ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
          { realtime: { transport: ws as any } })
      : null

    const [tmplWa, tmplEmail] = sb && empresa_id
      ? await Promise.all([
          buscarTemplate(sb, empresa_id, 'reset_senha', 'whatsapp'),
          buscarTemplate(sb, empresa_id, 'reset_senha', 'email'),
        ])
      : [null, null]

    const resultados: any = {}

    // WhatsApp
    if (numero) {
      let mensagem: string
      if (tmplWa && tmplWa.ativo) {
        mensagem = renderizar(tmplWa.corpo, vars)
      } else {
        mensagem = `Olá${nome ? ` ${nome}` : ''}! 👋\n\nVocê solicitou a recuperação de senha do *CheckFlow*.\n\nClique no link abaixo para criar uma nova senha:\n${link}\n\n_Este link expira em 1 hora._`
      }
      if (!tmplWa || tmplWa.ativo) {
        resultados.whatsapp = await enviarWhatsApp({ numero, mensagem })
      }
    }

    // Email (ignora o e-mail técnico não-entregável <cpf>@checkflow.local)
    if (email && !email.endsWith('@checkflow.local')) {
      let assunto = 'Recuperação de senha — CheckFlow'
      let html: string

      if (tmplEmail && tmplEmail.ativo) {
        assunto = renderizar(tmplEmail.assunto ?? assunto, vars)
        const corpoHtml = renderizar(tmplEmail.corpo, vars)
          .split('\n').map(l => `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6">${l || '&nbsp;'}</p>`).join('')
        html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
  <table width="100%"><tr><td align="center" style="padding:32px 16px">
    <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #e5e7eb">
      <tr><td style="background:#f97316;padding:20px 28px"><p style="margin:0;color:#fff;font-size:20px;font-weight:700">CheckFlow</p></td></tr>
      <tr><td style="padding:28px">${corpoHtml}
        <a href="${link}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#f97316;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px">Criar nova senha →</a>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#fafafa"><p style="margin:0;font-size:11px;color:#9ca3af">Email automático — não responda.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`
      } else if (!tmplEmail) {
        html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:32px">
<h2 style="color:#f97316">CheckFlow</h2>
<p>Olá${nome ? ` ${nome}` : ''}!</p>
<p>Você solicitou a recuperação de senha. Clique no link para criar uma nova senha:</p>
<a href="${link}" style="display:inline-block;padding:12px 24px;background:#f97316;color:#fff;text-decoration:none;border-radius:8px">Criar nova senha</a>
<p style="color:#999;font-size:12px;margin-top:24px">Este link expira em 1 hora.</p>
</body></html>`
      } else {
        // tmplEmail.ativo === false — não envia email
        html = ''
      }

      if (html) {
        resultados.email = await enviarEmail({ para: email, assunto, html })
      }
    }

    return reply.send(resultados)
  })

  // POST /whatsapp/enviar-codigo — envia código numérico (OTP) via WhatsApp + Email
  app.post('/whatsapp/enviar-codigo', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    const { numero, nome, codigo, email, empresa_id, contexto } = req.body as {
      numero?: string; nome: string; codigo: string; email?: string; empresa_id?: string
      contexto?: 'primeiro_acesso' | 'reset_admin' | 'self_service'
    }
    if (!codigo) return reply.status(400).send({ error: 'codigo é obrigatório' })

    const vars = {
      nome,
      linha_nome: nome ? ` ${nome}` : '',
      codigo,
      link: '',
    }

    const sb = empresa_id
      ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
          { realtime: { transport: ws as any } })
      : null

    const [tmplWa, tmplEmail] = sb && empresa_id
      ? await Promise.all([
          buscarTemplate(sb, empresa_id, 'reset_senha', 'whatsapp'),
          buscarTemplate(sb, empresa_id, 'reset_senha', 'email'),
        ])
      : [null, null]

    const resultados: any = {}

    const fallbackTexto = (() => {
      if (contexto === 'primeiro_acesso') {
        const appUrl = (process.env.APP_URL ?? 'https://app.checkflow.digital').replace(/\/$/, '')
        return `Olá${nome ? ` ${nome}` : ''}! 👋\n\nSeu acesso ao *CheckFlow* foi criado.\n\nSeu código de primeiro acesso é:\n\n*${codigo}*\n\nClique no link abaixo para definir sua senha:\n${appUrl}/primeiro-acesso\n\n_Este código expira em 15 minutos._`
      }
      const appUrl = (process.env.APP_URL ?? 'https://app.checkflow.digital').replace(/\/$/, '')
      const aviso = contexto === 'reset_admin' ? '' : '\n\n_Se você não solicitou, ignore esta mensagem._'
      return `Olá${nome ? ` ${nome}` : ''}! 👋\n\nSua senha no *CheckFlow* foi redefinida.\n\nSeu código de verificação é:\n\n*${codigo}*\n\nClique no link abaixo para criar sua nova senha:\n${appUrl}/recuperar-senha${aviso}\n\n_Este código expira em 15 minutos._`
    })()

    // WhatsApp
    if (numero) {
      let mensagem: string
      if (tmplWa && tmplWa.ativo && tmplWa.corpo.includes('{{codigo}}')) {
        mensagem = renderizar(tmplWa.corpo, vars)
      } else {
        mensagem = fallbackTexto
      }
      if (!tmplWa || tmplWa.ativo) {
        resultados.whatsapp = await enviarWhatsApp({ numero, mensagem })
      }
    }

    // Email (ignora o e-mail técnico não-entregável <cpf>@checkflow.local)
    if (email && !email.endsWith('@checkflow.local')) {
      let assunto = 'Código de verificação — CheckFlow'
      let html: string

      if (tmplEmail && tmplEmail.ativo && tmplEmail.corpo.includes('{{codigo}}')) {
        assunto = renderizar(tmplEmail.assunto ?? assunto, vars)
        const corpoHtml = renderizar(tmplEmail.corpo, vars)
          .split('\n').map(l => `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6">${l || '&nbsp;'}</p>`).join('')
        html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
  <table width="100%"><tr><td align="center" style="padding:32px 16px">
    <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #e5e7eb">
      <tr><td style="background:#f97316;padding:20px 28px"><p style="margin:0;color:#fff;font-size:20px;font-weight:700">CheckFlow</p></td></tr>
      <tr><td style="padding:28px">${corpoHtml}
        <div style="margin-top:16px;padding:16px;background:#fafafa;border-radius:10px;text-align:center">
          <span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#f97316">${codigo}</span>
        </div>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#fafafa"><p style="margin:0;font-size:11px;color:#9ca3af">Email automático — não responda.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`
      } else if (!tmplEmail || tmplEmail.ativo) {
        const titulo = contexto === 'primeiro_acesso' ? 'Bem-vindo ao CheckFlow' : 'Recuperação de senha'
        const appUrl = (process.env.APP_URL ?? 'https://app.checkflow.digital').replace(/\/$/, '')
        const texto = contexto === 'primeiro_acesso'
          ? `Seu acesso ao CheckFlow foi criado. Use o código abaixo na página de primeiro acesso para definir sua senha: <a href="${appUrl}/primeiro-acesso">${appUrl}/primeiro-acesso</a>`
          : `${contexto === 'reset_admin' ? 'Sua senha foi redefinida pelo administrador.' : 'Você solicitou a recuperação de senha.'} Use o código abaixo para criar sua nova senha: <a href="${appUrl}/recuperar-senha">${appUrl}/recuperar-senha</a>`
        html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:32px">
<h2 style="color:#f97316">CheckFlow</h2>
<p>Olá${nome ? ` ${nome}` : ''}!</p>
<p>${titulo}</p>
<p>${texto}</p>
<div style="margin-top:16px;padding:16px;background:#fafafa;border-radius:10px;text-align:center">
  <span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#f97316">${codigo}</span>
</div>
<p style="color:#999;font-size:12px;margin-top:24px">Este código expira em 15 minutos.</p>
</body></html>`
      } else {
        html = ''
      }

      if (html) {
        resultados.email = await enviarEmail({ para: email, assunto, html })
      }
    }

    return reply.send(resultados)
  })
}
