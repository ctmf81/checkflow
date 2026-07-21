import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { exigirAutorizacao } from '../lib/apiAuth'
import { enviarWhatsApp, enviarWhatsAppMidia } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { enviarPush } from '../lib/push'
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

const PERFIL_ADMIN_EMPRESA = '00000000-0000-0000-0000-000000000002'

/**
 * Pode (des)vincular duplicados de um ticket = é o RESPONSÁVEL do principal, ou
 * admin de sistema, ou admin da empresa do ticket. (A autoria do vínculo é do
 * responsável — quem assumiu.)
 */
async function atorPodeGerirVinculo(
  sb: any, atorId: string, principal: { unidade_id: string; assignee_id: string | null },
): Promise<boolean> {
  if (atorId && principal.assignee_id === atorId) return true
  const { data: u } = await sb.auth.admin.getUserById(atorId)
  if ((u?.user?.app_metadata as any)?.role === 'admin_sistema') return true
  const empresaId = await empresaDeUnidade(sb, principal.unidade_id)
  if (empresaId) {
    const { data: ue } = await sb.from('usuario_empresa')
      .select('perfil_id').eq('empresa_id', empresaId).eq('usuario_id', atorId).maybeSingle()
    if ((ue as any)?.perfil_id === PERFIL_ADMIN_EMPRESA) return true
  }
  return false
}

// ─── Rota ────────────────────────────────────────────────────────────────────

export async function ticketsRoutes(app: FastifyInstance) {

  app.post('/tickets/notificar', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
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

    const baseUrl = process.env.APP_URL ?? 'https://app.checkflow.digital'

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

    // Na CONCLUSÃO do principal, avisa também os "interessados": os abridores dos
    // tickets duplicados vinculados a este. É como quem abriu um duplicado
    // acompanha o desfecho (o duplicado dele fica congelado, não é tratado).
    if (evento === 'conclusao') {
      const { data: dups } = await sb.from('tickets').select('aberto_por_id').eq('ticket_pai_id', ticket_id)
      const jaTem = new Set(destinatarios.map((u) => u.id))
      const extraIds = [...new Set((dups ?? []).map((d: any) => d.aberto_por_id))]
        .filter((uid): uid is string => !!uid && uid !== ator_id && !jaTem.has(uid))
      if (extraIds.length) {
        const { data: extras } = await sb.from('usuarios').select('id, nome, email, telefone').in('id', extraIds)
        destinatarios = destinatarios.concat((extras ?? []) as any)
      }
    }

    if (!destinatarios.length) return reply.send({ wa_enviados: 0, email_enviados: 0, motivo: 'Sem destinatários' })

    // 4b. Perfil de cada destinatário → link personalizado (gestão vs operação)
    const PERFIL_OPERACAO = '00000000-0000-0000-0000-000000000003'
    let perfilMap = new Map<string, string>()
    if (empresaId) {
      const { data: perfis } = await sb.from('usuario_empresa')
        .select('usuario_id, perfil_id')
        .eq('empresa_id', empresaId)
        .in('usuario_id', destinatarios.map((u: any) => u.id))
      perfilMap = new Map((perfis ?? []).map((p: any) => [p.usuario_id, p.perfil_id]))
    }
    function linkParaUsuario(uid: string): string {
      const perfil = perfilMap.get(uid)
      const area = perfil === PERFIL_OPERACAO ? 'operacao' : 'gestao'
      return `${baseUrl}/${area}/tickets/${ticket_id}`
    }

    // 5. Turno (só para WA/push no evento 'aberto'): suprime modo 'notificacao' fora do horário
    const foraDoTurno = new Set<string>()
    if (evento === 'aberto') {
      await Promise.all(destinatarios.map(async (u) => {
        const { data: recebe } = await sb.rpc('usuario_recebe_notificacao', { p_usuario_id: u.id })
        if (recebe === false) foraDoTurno.add(u.id)
      }))
    }

    // Férias: suprime TODOS os canais (WA, e-mail, push), em TODOS os eventos.
    const deFerias = new Set<string>()
    await Promise.all(destinatarios.map(async (u) => {
      const { data: ferias } = await sb.rpc('usuario_esta_de_ferias', { p_usuario_id: u.id })
      if (ferias === true) deFerias.add(u.id)
    }))

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

    // Variáveis base de interpolação (link é por-destinatário — veja abaixo)
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
    }

    // 8. Dispara para cada destinatário
    let waEnviados = 0, emailEnviados = 0, pushEnviados = 0
    const erros: string[] = []

    await Promise.all(destinatarios.map(async (u) => {
      const link = linkParaUsuario(u.id)
      const vars = { ...varsBase, link, destinatario: u.nome }

      if (deFerias.has(u.id)) return // de férias: não recebe por nenhum canal

      // ── Push (PWA) ── mesmo público do WA (respeita turno no evento 'aberto')
      if (!foraDoTurno.has(u.id)) {
        const titulo = evento === 'aberto' ? `Novo ticket #${numeroStr}` : `Ticket #${numeroStr} — ${eventoLabel}`
        const corpo = evento === 'aberto' ? t.titulo : (texto || t.titulo)
        pushEnviados += (await enviarPush(sb, [u.id], { titulo, corpo, url: link, tag: `ticket-${ticket_id}` })).enviados
      }

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
          htmlBody = buildEmailHtml(assunto, corpoHtml, link, cor, evento === 'aberto' ? primeiraFoto : null)
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
      push_enviados: pushEnviados,
      total_destinatarios: destinatarios.length,
      erros: erros.length ? erros : undefined,
    })
  })

  // POST /tickets/vincular — marca `duplicado_id` como duplicado de `principal_id`.
  // Feito server-side (service role) porque quem vincula é o RESPONSÁVEL do
  // principal, que pode não ter permissão de UPDATE no duplicado pela RLS.
  app.post('/tickets/vincular', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    const { principal_id, duplicado_id, ator_id } = req.body as {
      principal_id: string; duplicado_id: string; ator_id: string
    }
    if (!principal_id || !duplicado_id || !ator_id) {
      return reply.status(400).send({ error: 'principal_id, duplicado_id e ator_id são obrigatórios' })
    }
    if (principal_id === duplicado_id) {
      return reply.status(400).send({ error: 'Um ticket não pode ser duplicado de si mesmo' })
    }

    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
      { realtime: { transport: ws as any } })

    const { data: rows } = await sb.from('tickets')
      .select('id, numero, unidade_id, assignee_id, aberto_por_id, status, ticket_pai_id')
      .in('id', [principal_id, duplicado_id])
    let principal: any = (rows ?? []).find((r: any) => r.id === principal_id)
    const duplicado: any = (rows ?? []).find((r: any) => r.id === duplicado_id)
    if (!principal || !duplicado) return reply.status(404).send({ error: 'Ticket não encontrado' })

    // Vínculo é plano: se o "principal" escolhido já é duplicado, sobe para o pai real.
    if (principal.ticket_pai_id) {
      const { data: raiz } = await sb.from('tickets')
        .select('id, numero, unidade_id, assignee_id, aberto_por_id, ticket_pai_id')
        .eq('id', principal.ticket_pai_id).single()
      if (raiz) { principal = raiz }
    }
    if (principal.id === duplicado.id) {
      return reply.status(400).send({ error: 'Um ticket não pode ser duplicado de si mesmo' })
    }
    if (principal.unidade_id !== duplicado.unidade_id) {
      return reply.status(400).send({ error: 'Só é possível vincular tickets da mesma unidade' })
    }
    if (duplicado.status === 'duplicado' || duplicado.ticket_pai_id) {
      return reply.status(409).send({ error: 'Este ticket já está vinculado como duplicado' })
    }
    const FECHADOS = ['corrigido', 'nao_corrigido', 'corrigido_parcialmente', 'cancelado', 'improcedente']
    if (FECHADOS.includes(duplicado.status)) {
      return reply.status(409).send({ error: 'Ticket encerrado não pode ser vinculado como duplicado' })
    }
    const { count: filhos } = await sb.from('tickets')
      .select('id', { count: 'exact', head: true }).eq('ticket_pai_id', duplicado.id)
    if (filhos && filhos > 0) {
      return reply.status(409).send({ error: 'Este ticket já é principal de outros duplicados; não pode virar duplicado' })
    }
    if (!await atorPodeGerirVinculo(sb, ator_id, principal)) {
      return reply.status(403).send({ error: 'Apenas o responsável do ticket principal (ou um admin) pode vincular duplicados' })
    }

    const { data: upd, error: upErr } = await sb.from('tickets')
      .update({ ticket_pai_id: principal.id, status: 'duplicado' })
      .eq('id', duplicado.id).select('id')
    if (upErr || !upd?.length) {
      return reply.status(500).send({ error: upErr?.message ?? 'Falha ao vincular' })
    }

    const nDup = String(duplicado.numero).padStart(4, '0')
    const nPri = String(principal.numero).padStart(4, '0')
    await sb.from('ticket_eventos').insert([
      { ticket_id: duplicado.id, tipo: 'vinculo', autor_id: ator_id, texto: `Vinculado como duplicado do #${nPri}.`, meta: { principal_id: principal.id, principal_numero: principal.numero } },
      { ticket_id: principal.id, tipo: 'vinculo', autor_id: ator_id, texto: `#${nDup} vinculado a este chamado como duplicado.`, meta: { duplicado_id: duplicado.id, duplicado_numero: duplicado.numero } },
    ])

    return reply.send({ ok: true, principal_id: principal.id, principal_numero: principal.numero, duplicado_id: duplicado.id })
  })

  // POST /tickets/desvincular — devolve o duplicado para 'aberto' (vínculo errado).
  app.post('/tickets/desvincular', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    const { duplicado_id, ator_id } = req.body as { duplicado_id: string; ator_id: string }
    if (!duplicado_id || !ator_id) return reply.status(400).send({ error: 'duplicado_id e ator_id são obrigatórios' })

    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
      { realtime: { transport: ws as any } })

    const { data: duplicado } = await sb.from('tickets')
      .select('id, numero, unidade_id, ticket_pai_id, status').eq('id', duplicado_id).single()
    if (!duplicado) return reply.status(404).send({ error: 'Ticket não encontrado' })
    if (!(duplicado as any).ticket_pai_id) return reply.status(409).send({ error: 'Este ticket não está vinculado' })

    const { data: principal } = await sb.from('tickets')
      .select('id, numero, unidade_id, assignee_id').eq('id', (duplicado as any).ticket_pai_id).single()
    if (principal && !await atorPodeGerirVinculo(sb, ator_id, principal as any)) {
      return reply.status(403).send({ error: 'Apenas o responsável do ticket principal (ou um admin) pode desvincular' })
    }

    const { data: upd, error: upErr } = await sb.from('tickets')
      .update({ ticket_pai_id: null, status: 'aberto' }).eq('id', duplicado_id).select('id')
    if (upErr || !upd?.length) return reply.status(500).send({ error: upErr?.message ?? 'Falha ao desvincular' })

    const nDup = String((duplicado as any).numero).padStart(4, '0')
    const nPri = principal ? String((principal as any).numero).padStart(4, '0') : '—'
    await sb.from('ticket_eventos').insert([
      { ticket_id: duplicado_id, tipo: 'desvinculo', autor_id: ator_id, texto: `Desvinculado do #${nPri}; voltou para "Aberto".` },
      ...(principal ? [{ ticket_id: (principal as any).id, tipo: 'desvinculo', autor_id: ator_id, texto: `#${nDup} foi desvinculado deste chamado.` }] : []),
    ])

    return reply.send({ ok: true })
  })
}

// ─── Wrapper HTML genérico para templates editados pela empresa ───────────────

function buildEmailHtml(assunto: string, corpoHtml: string, link: string, cor: string, fotoUrl?: string | null): string {
  const foto = fotoUrl
    ? `<img src="${fotoUrl}" alt="Evidência" style="display:block;width:100%;max-width:504px;border-radius:10px;margin-top:16px;border:1px solid #e5e7eb" />`
    : ''
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
          ${corpoHtml}${foto}
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
