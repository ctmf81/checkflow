import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import { enviarWhatsApp, enviarWhatsAppMidia } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { emailTicketAberto, emailTicketMovimentado } from '../lib/email-templates'

// ─── Mensagens WhatsApp ───────────────────────────────────────────────────────

const PRIORIDADE_EMOJI: Record<string, string> = {
  critica: '🔴', alta: '🟠', media: '🟡', baixa: '🟢',
}

function waMensagemAberto(dados: {
  numero: string
  titulo: string
  descricao: string
  prioridade: string
  nomeGrupo: string
  nomeSubgrupo: string
  categoria: string | null
  atorNome: string
  link: string
}): string {
  const emoji = PRIORIDADE_EMOJI[dados.prioridade] ?? '⚪'
  const cat   = dados.categoria ? `\n*Categoria:* ${dados.categoria}` : ''
  return (
    `${emoji} *Novo Ticket aberto — ${dados.prioridade.toUpperCase()}*\n\n` +
    `*#${dados.numero} ${dados.titulo}*\n\n` +
    `*Destino:* ${dados.nomeGrupo} / ${dados.nomeSubgrupo}${cat}\n` +
    `*Aberto por:* ${dados.atorNome}\n\n` +
    `_${dados.descricao.slice(0, 200)}${dados.descricao.length > 200 ? '…' : ''}_\n\n` +
    `🔗 ${dados.link}`
  )
}

function waMensagemMovimentacao(dados: {
  numero: string
  titulo: string
  evento: string
  atorNome: string
  texto: string
  link: string
}): string {
  return (
    `📋 *Ticket #${dados.numero} — ${dados.evento}*\n\n` +
    `*${dados.titulo}*\n` +
    `*Por:* ${dados.atorNome}\n\n` +
    `_${dados.texto.slice(0, 200)}${dados.texto.length > 200 ? '…' : ''}_\n\n` +
    `🔗 ${dados.link}`
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatarNumero(tel: string): string {
  const n = tel.replace(/\D/g, '').replace(/^0/, '')
  return n.startsWith('55') ? n : `55${n}`
}

// ─── Rota ────────────────────────────────────────────────────────────────────

export async function ticketsRoutes(app: FastifyInstance) {

  /**
   * POST /tickets/notificar
   *
   * Body:
   *   ticket_id — UUID do ticket
   *   evento    — 'aberto' | 'aceite' | 'devolucao' | 'conclusao_proposta' |
   *               'validacao' | 'reabertura' | 'cancelamento' | 'comentario'
   *   ator_id   — UUID do usuário que disparou
   *   texto     — observação do evento
   *
   * Para 'aberto': notifica todos do grupo+subgrupo destino que estão no turno.
   * Para outros eventos: notifica abridor + assignee (os dois lados do ticket).
   * WhatsApp: respeita turno. Email: sempre, independente de turno.
   * Fire-and-forget: erros são registrados mas não quebram o fluxo.
   */
  app.post('/tickets/notificar', async (req, reply) => {
    const { ticket_id, evento, ator_id, texto } = req.body as {
      ticket_id: string
      evento: string
      ator_id: string
      texto: string
    }

    if (!ticket_id || !evento) {
      return reply.status(400).send({ error: 'ticket_id e evento são obrigatórios' })
    }

    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // 1. Carrega o ticket com contexto completo
    const { data: ticket } = await sb.from('tickets').select(`
      id, numero, titulo, descricao, prioridade, status,
      grupo_id, subgrupo_id,
      grupo:grupos(nome),
      subgrupo:subgrupos(nome),
      categoria:ticket_categorias(nome),
      aberto_por:usuarios!tickets_aberto_por_id_fkey(id, nome, email, telefone),
      assignee:usuarios!tickets_assignee_id_fkey(id, nome, email, telefone)
    `).eq('id', ticket_id).single()

    if (!ticket) return reply.status(404).send({ error: 'Ticket não encontrado' })

    const t = ticket as any
    const nomeGrupo    = t.grupo?.nome ?? '—'
    const nomeSubgrupo = t.subgrupo?.nome ?? '—'
    const nomeCategoria = t.categoria?.nome ?? null
    const numeroStr    = String(t.numero).padStart(4, '0')

    const baseUrl = process.env.APP_URL ?? 'https://web-production-36880.up.railway.app'
    const link    = `${baseUrl}/gestao/tickets/${ticket_id}`

    // 2. Determina destinatários por tipo de evento
    let destinatarios: { id: string; nome: string; email: string | null; telefone: string | null }[] = []

    if (evento === 'aberto') {
      // Notifica todos do grupo/subgrupo destino (membros do subgrupo)
      const { data: membros } = await sb.from('usuario_subgrupo')
        .select('usuario_id, usuarios(id, nome, email, telefone)')
        .eq('subgrupo_id', t.subgrupo_id)

      destinatarios = (membros ?? [])
        .map((m: any) => m.usuarios)
        .filter(Boolean)
        .filter((u: any) => u.id !== ator_id) // não notifica quem abriu

    } else {
      // Notifica o outro lado: abridor + assignee (exceto o ator atual)
      const candidatos = [t.aberto_por, t.assignee].filter(Boolean)
      destinatarios = candidatos.filter((u: any) => u?.id && u.id !== ator_id)
    }

    if (!destinatarios.length) {
      return reply.send({ wa_enviados: 0, email_enviados: 0, motivo: 'Sem destinatários' })
    }

    // 3. Verifica turno para WhatsApp (só restringe WA, não email)
    const foraDoTurno = new Set<string>()
    if (evento === 'aberto') {
      await Promise.all(destinatarios.map(async (u) => {
        const { data: dentro } = await sb.rpc('usuario_esta_no_turno', { p_usuario_id: u.id })
        if (dentro === false) foraDoTurno.add(u.id)
      }))
    }

    // 4. Primeira evidência do ticket (foto) para enriquecer notificações
    const { data: evids } = await sb.from('ticket_evidencias')
      .select('url, tipo')
      .eq('ticket_id', ticket_id)
      .eq('tipo', 'foto')
      .order('criado_em', { ascending: true })
      .limit(1)
    const primeiraFoto: string | null = evids?.[0]?.url ?? null

    // 5. Nome do evento para exibição
    const EVENTO_LABEL: Record<string, string> = {
      aceite:            'Ticket assumido',
      devolucao:         'Devolução — aguardando informação',
      resposta_devolucao:'Resposta enviada',
      conclusao_proposta:'Conclusão proposta',
      validacao:         'Ticket validado',
      reabertura:        'Ticket reaberto',
      cancelamento:      'Ticket cancelado',
      comentario:        'Novo comentário',
    }
    const eventoLabel = EVENTO_LABEL[evento] ?? evento

    // Nome do ator
    const { data: atorUser } = await sb.from('usuarios').select('nome').eq('id', ator_id).single()
    const atorNome = (atorUser as any)?.nome ?? 'Sistema'

    // 6. Dispara notificações
    let waEnviados = 0, emailEnviados = 0
    const erros: string[] = []

    await Promise.all(destinatarios.map(async (u) => {
      // ── WhatsApp ──
      if (u.telefone && !foraDoTurno.has(u.id)) {
        const numero = formatarNumero(u.telefone)

        const mensagem = evento === 'aberto'
          ? waMensagemAberto({
              numero: numeroStr, titulo: t.titulo, descricao: t.descricao,
              prioridade: t.prioridade, nomeGrupo, nomeSubgrupo, categoria: nomeCategoria,
              atorNome, link,
            })
          : waMensagemMovimentacao({
              numero: numeroStr, titulo: t.titulo, evento: eventoLabel,
              atorNome, texto, link,
            })

        const { ok, erro } = primeiraFoto && evento === 'aberto'
          ? await enviarWhatsAppMidia({ numero, imagemUrl: primeiraFoto, caption: mensagem })
          : await enviarWhatsApp({ numero, mensagem })

        if (ok) waEnviados++
        else erros.push(`WA ${u.nome}: ${erro}`)
      }

      // ── Email ──
      if (u.email) {
        const template = evento === 'aberto'
          ? emailTicketAberto({
              nomeDestinatario: u.nome,
              numero: numeroStr,
              titulo: t.titulo,
              descricao: t.descricao,
              prioridade: t.prioridade,
              nomeGrupo,
              nomeSubgrupo,
              categoria: nomeCategoria,
              atorNome,
              fotoUrl: primeiraFoto,
              ticketId: ticket_id,
            })
          : emailTicketMovimentado({
              nomeDestinatario: u.nome,
              numero: numeroStr,
              titulo: t.titulo,
              eventoLabel,
              atorNome,
              texto,
              fotoUrl: primeiraFoto,
              ticketId: ticket_id,
            })

        const { ok, erro } = await enviarEmail({ para: u.email, ...template })
        if (ok) emailEnviados++
        else erros.push(`Email ${u.nome}: ${erro}`)
      }
    }))

    return reply.send({
      wa_enviados: waEnviados,
      email_enviados: emailEnviados,
      total_destinatarios: destinatarios.length,
      erros: erros.length ? erros : undefined,
    })
  })
}
