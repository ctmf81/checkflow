import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { exigirAutorizacao } from '../lib/apiAuth'
import { enviarTelegram, configurarWebhook, statusTelegram } from '../lib/telegram'

// Segredo compartilhado com o Telegram: ele devolve no header abaixo em cada
// update, provando que a chamada veio mesmo do Telegram (e não de um terceiro).
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { realtime: { transport: ws as any } },
  )
}

// ─── Rota ────────────────────────────────────────────────────────────────────

export async function telegramRoutes(app: FastifyInstance) {
  /**
   * POST /telegram/webhook  (chamado PELO Telegram, não pela nossa app)
   *
   * Recebe updates do bot. Trata o "/start <code>": casa o <code> ao usuário
   * (telegram_link_code), grava o chat_id e confirma o vínculo por mensagem.
   * É assim que o usuário conecta o Telegram — sem informar número.
   */
  app.post('/telegram/webhook', async (req, reply) => {
    // Autenticação: o Telegram devolve o secret_token que registramos no setup.
    if (WEBHOOK_SECRET) {
      const recebido = req.headers['x-telegram-bot-api-secret-token']
      if (recebido !== WEBHOOK_SECRET) return reply.status(401).send({ ok: false })
    }

    const update = (req.body ?? {}) as any
    const msg = update?.message
    const chatId = msg?.chat?.id
    const texto: string = msg?.text ?? ''
    // Sempre respondemos 200 ao Telegram (senão ele reenvia o update em loop).
    if (!chatId || !texto.startsWith('/start')) return reply.send({ ok: true })

    const code = texto.split(/\s+/)[1]?.trim()
    const chatIdStr = String(chatId)

    if (!code) {
      await enviarTelegram(chatIdStr,
        'Para receber avisos do CheckFlow, abra o botão "Conectar Telegram" no app e toque no link gerado ali.')
      return reply.send({ ok: true })
    }

    const supabase = sb()
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, nome')
      .eq('telegram_link_code', code)
      .maybeSingle()

    if (!usuario) {
      await enviarTelegram(chatIdStr,
        'Não encontrei um vínculo para este link. Gere um novo pelo botão "Conectar Telegram" no app.')
      return reply.send({ ok: true })
    }

    await supabase.from('usuarios').update({
      telegram_chat_id: chatIdStr,
      telegram_vinculado_em: new Date().toISOString(),
    }).eq('id', usuario.id)

    await enviarTelegram(chatIdStr,
      `✅ Telegram conectado, ${String(usuario.nome).split(' ')[0]}! Você passará a receber os avisos do CheckFlow por aqui.`)
    return reply.send({ ok: true })
  })

  /**
   * POST /telegram/setup  (admin de sistema, uma vez por ambiente)
   *
   * Registra a URL do webhook no Telegram. Body: { url } — a URL pública HTTPS
   * deste serviço + /telegram/webhook (ex.: https://api-.../telegram/webhook).
   */
  app.post('/telegram/setup', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    const { url } = (req.body ?? {}) as { url?: string }
    if (!url) return reply.status(400).send({ error: 'url é obrigatória' })
    const r = await configurarWebhook(url, WEBHOOK_SECRET || undefined)
    if (!r.ok) return reply.status(500).send({ error: r.erro })
    return reply.send({ ok: true, url })
  })

  /**
   * GET /telegram/status  (health do canal — admin)
   * Retorna se o token está configurado, a URL do webhook, pendências e o
   * último erro reportado pelo Telegram. Alimenta a tela de saúde do sistema.
   */
  app.get('/telegram/status', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    return reply.send(await statusTelegram())
  })
}
