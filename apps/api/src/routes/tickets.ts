import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { enviarWhatsApp, enviarWhatsAppMidia } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { emailTicketAberto, emailTicketMovimentado } from '../lib/email-templates'
import {
  buscarTemplate, renderizar, empresaDeUnidade,
  type NotificacaoTipo,
} from '../lib/notificacao-templates'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORIDADE_EMOJI: Record<string, string> = {
  critica: '🔴', alta: '🟠', media: '🟡', baixa: '🟢',
}

const PRIORIDADE_COR: Record<string, string> = {
  critica: '#dc2626', alta: '#ea580c', media: '#ca8a04', baixa: '#16a34a',
}

const EVENTO_LABEL: Record<string, string> = {
  aceite:             'Ticket assumido',
  devolucao:          'Devolução — aguardando informação',
  resposta_devolucao: 'Resposta enviada',
  conclusao:          'Ticket concluído',
  conclusao_proposta: 'Conclusão proposta',
  validacao:          'Ticket validado',
  reabertura:         'Ticket reaberto',
  cancelamento:       'Ticket cancelado',
  comentario:         'Novo comentário',
}

function formatarNumero(tel: string): string {
  const n = tel.replace(/\D/g, '').replace(/^0/, '')
  return n.startsWith('55') ? n : `55${n}`
}

// ─── Rota ────────────────────────────────────────────────────────────────────

export async function ticketsRoutes(app: FastifyInstance) {

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
      process.env.SUPABASE_SECRET_KEY!,
      { realtime: { transport: ws as any } }
    )

    // 1. Carrega o ticket
    // Não usa embed de `usuarios` via FK: tickets.aberto_por_id/assignee_id
    // referenciam auth.users, não usuarios — PostgREST não acha essa relação.
    const { data: ticket } = await sb.from('tickets').select(`
      id, numero, titulo, descricao, prioridade, status,
      unidade_id, grupo_id, subgrupo_id, aberto_por_id, assignee_id,
      grupo:grupos(nome),
      subgrupo:subgrupos(nome),
      categoria:ticket_categorias(nome)
    `).eq('id', ticket_id).single()

    if (!ticket) return reply.status(404).send({ error: 'Ticket não encontrado' })

    const t = ticket as any

    // Busca aberto_por e assignee na tabela usuarios
    const idsUsuarios = [t.aberto_por_id, t.assignee_id].filter(Boolean)
    const { data: usuariosTicket } = idsUsuarios.length
      ? await sb.from('usuarios').select('id, nome, email, telefone').in('id', idsUsuarios)
      : { data: [] }
    const usuariosMap = new Map((usuariosTicket ?? []).map((u: any) => [u.id, u]))
    t.aberto_por = usuariosMap.get(t.aberto_por_id) ?? null
    t.assignee = t.assignee_id ? (usuariosMap.get(t.assignee_id) ?? null) : null
    const nomeGrupo     = t.grupo?.nome ?? '—'
    const nomeSubgrupo  = t.subgrupo?.nome ?? '—'
    const nomeCategoria = t.categoria?.nome ?? null
    const numeroStr     = String(t.numero).padStart(4, '0')
    const emoji         = PRIORIDADE_EMOJI[t.prioridade] ?? '⚪'
    const cor           = PRIORIDADE_COR[t.prioridade] ?? '#6b7280'
    const eventoLabel   = EVENTO_LABEL[evento] ?? evento

    const baseUrl = process.env.APP_URL ?? 'https://web-production-36880.up.railway.app'
    const link    = `${baseUrl}/gestao/tickets/${ticket_id}`

    // 2. Empresa do ticket
    const empresaId = await empresaDeUnidade(sb, t.unidade_id)

    // 3. Nome do ator
    const { data: atorUser } = await sb.from('usuarios').select('nome').eq('id', ator_id).single()
    const atorNome = (atorUser as any)?.nome ?? 'Sistema'

    // 4. Destinatários
    let destinatarios: { id: string; nome: string; email: string | null; telefone: string | null }[] = []

    if (evento === 'aberto') {
      const { data: membros } = await sb.from('usuario_subgrupo')
        .select('usuario_id, usuarios(id, nome, email, telefone)')
        .eq('subgrupo_id', t.subgrupo_id)
      destinatarios = (membros ?? []).map((m: any) => m.usuarios).filter(Boolean).filter((u: any) => u.id !== ator_id)
    } else {
      const candidatos = [t.aberto_por, t.assignee].filter(Boolean)
      destinatarios = candidatos.filter((u: any) => u?.id && u.id !== ator_id)
    }

    if (!destinatarios.length) return reply.send({ wa_enviados: 0, email_enviados: 0, motivo: 'Sem destinatários' })

    // 5. Turno (só para WA no evento 'aberto'): suprime só modo 'notificacao' fora do horário
    const foraDoTurno = new Set<string>()
    if (evento === 'aberto') {
      await Promise.all(destinatarios.map(async (u) => {
        const { data: recebe } = await sb.rpc('usuario_recebe_notificacao', { p_usuario_id: u.id })
        if (recebe === false) foraDoTurno.add(u.id)
      }))
    }

    // 6. Primeira foto de evidência
    const { data: evids } = await sb.from('ticket_evidencias')
      .select('url, tipo').eq('ticket_id', ticket_id).eq('tipo', 'foto')
      .order('criado_em', { ascending: true }).limit(1)
    const primeiraFoto: string | null = evids?.[0]?.url ?? null

    // 7. Busca templates da empresa
    const tipoNotif: NotificacaoTipo = evento === 'aberto' ? 'ticket_aberto' : 'ticket_movimentado'
    const [tmplWa, tmplEmail] = empresaId
      ? await Promise.all([
          buscarTemplate(sb, empresaId, tipoNotif, 'whatsapp'),
          buscarTemplate(sb, empresaId, tipoNotif, 'email'),
        ])
      : [null, null]

    // Variáveis comuns de interpolação
    const varsBase = {
      numero: numeroStr,
      titulo: t.titulo,
      descricao: t.descricao ?? '',
      prioridade: t.prioridade,
      emoji_prioridade: emoji,
      grupo: nomeGrupo,
      subgrupo: nomeSubgrupo,
      linha_categoria: nomeCategoria ? `\nCategoria: ${nomeCategoria}` : '',
      ator: atorNome,
      evento: eventoLabel,
      observacao: texto ?? '',
      link,
    }

    // 8. Dispara para cada destinatário
    let waEnviados = 0, emailEnviados = 0
    const erros: string[] = []

    await Promise.all(destinatarios.map(async (u) => {
      const vars = { ...varsBase, destinatario: u.nome }

      // ── WhatsApp ──
      if (u.telefone && !foraDoTurno.has(u.id)) {
        const numero = formatarNumero(u.telefone)

        // Usa template do banco se disponível e ativo; senão, hardcoded
        let mensagemWa: string | null = null
        if (tmplWa && tmplWa.ativo) {
          mensagemWa = renderizar(tmplWa.corpo, vars)
        } else if (!tmplWa) {
          // fallback hardcoded (empresa sem template — não deveria acontecer após seed)
          mensagemWa = evento === 'aberto'
            ? `${emoji} *Novo Ticket #${numeroStr} — ${t.prioridade}*\n\n*${t.titulo}*\n\n*Destino:* ${nomeGrupo} / ${nomeSubgrupo}\n*Aberto por:* ${atorNome}\n\n${t.descricao}\n\n🔗 ${link}`
            : `📋 *Ticket #${numeroStr} — ${eventoLabel}*\n\n*${t.titulo}*\n*Por:* ${atorNome}\n\n${texto}\n\n🔗 ${link}`
        }
        // tmplWa.ativo === false → não envia WA

        if (mensagemWa) {
          const { ok, erro } = primeiraFoto && evento === 'aberto'
            ? await enviarWhatsAppMidia({ numero, imagemUrl: primeiraFoto, caption: mensagemWa })
            : await enviarWhatsApp({ numero, mensagem: mensagemWa })
          if (ok) waEnviados++
          else erros.push(`WA ${u.nome}: ${erro}`)
        }
      }

      // ── Email ── (ignora o e-mail técnico não-entregável <cpf>@checkflow.local)
      if (u.email && !u.email.endsWith('@checkflow.local')) {
        let assunto: string | null = null
        let htmlBody: string | null = null

        if (tmplEmail && tmplEmail.ativo) {
          assunto  = renderizar(tmplEmail.assunto ?? `Ticket #${numeroStr}`, vars)
          // Converte plain text em HTML simples (mantém quebras de linha)
          const corpoHtml = renderizar(tmplEmail.corpo, vars)
            .split('\n').map(l => `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6">${l || '&nbsp;'}</p>`).join('')
          // Monta email com o template base existente
          const { emailTicketAberto: _ea, emailTicketMovimentado: _em, ..._ } = await import('../lib/email-templates')
          // Usa template genérico da empresa — constrói o html inline
          htmlBody = buildEmailHtml(assunto, corpoHtml, link, cor)
        } else if (!tmplEmail) {
          // fallback hardcoded
          const tpl = evento === 'aberto'
            ? emailTicketAberto({
                nomeDestinatario: u.nome, numero: numeroStr, titulo: t.titulo,
                descricao: t.descricao ?? '', prioridade: t.prioridade, nomeGrupo,
                nomeSubgrupo, categoria: nomeCategoria, atorNome,
                fotoUrl: primeiraFoto, ticketId: ticket_id,
              })
            : emailTicketMovimentado({
                nomeDestinatario: u.nome, numero: numeroStr, titulo: t.titulo,
                eventoLabel, atorNome, texto, fotoUrl: primeiraFoto, ticketId: ticket_id,
              })
          assunto  = tpl.assunto
          htmlBody = tpl.html
        }

        if (assunto && htmlBody) {
          const { ok, erro } = await enviarEmail({ para: u.email, assunto, html: htmlBody })
          if (ok) emailEnviados++
          else erros.push(`Email ${u.nome}: ${erro}`)
        }
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

// ─── Wrapper HTML genérico para templates editados pela empresa ───────────────

function buildEmailHtml(assunto: string, corpoHtml: string, link: string, cor: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="background:#f97316;padding:20px 28px">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">CheckFlow</p>
        </td></tr>
        <tr><td style="padding:28px">
          ${corpoHtml}
          <a href="${link}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:${cor};color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px">Ver no CheckFlow →</a>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#fafafa">
          <p style="margin:0;font-size:11px;color:#9ca3af">Email automático — não responda.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
