import { FastifyInstance } from 'fastify'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import { exigirAutorizacao } from '../lib/apiAuth'
import { enviarWhatsApp, enviarWhatsAppMidia } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { emailPlanoAberto, emailPlanoEnviadoN2 } from '../lib/email-templates'
import { buscarTemplate, renderizar, empresaDeSubgrupo } from '../lib/notificacao-templates'

// ─── Mensagens WhatsApp ───────────────────────────────────────────────────────

function waMensagemAberto(dados: {
  atorNome: string
  nomeAtividade: string
  nomeChecklist: string
  nomeSubgrupo: string
  observacao: string
  sla: string | null
  link: string
}): string {
  const slaLinha = dados.sla ? `\n⏱ SLA: ${dados.sla}` : ''
  return (
    `🔴 *Novo Plano de Ação aberto*\n\n` +
    `*Área:* ${dados.nomeSubgrupo}\n` +
    `*Atividade:* ${dados.nomeAtividade}\n` +
    `*Checklist:* ${dados.nomeChecklist}\n` +
    `*Aberto por:* ${dados.atorNome}\n` +
    `*Observação:* ${dados.observacao}` +
    slaLinha +
    `\n\n🔗 ${dados.link}`
  )
}

function waMensagemEnviadoN2(dados: {
  n1Nome: string
  nomeAtividade: string
  nomeChecklist: string
  nomeSubgrupo: string
  observacao: string
  link: string
}): string {
  return (
    `🟠 *Plano de Ação escalado para você (N2)*\n\n` +
    `*Área:* ${dados.nomeSubgrupo}\n` +
    `*Atividade:* ${dados.nomeAtividade}\n` +
    `*Checklist:* ${dados.nomeChecklist}\n` +
    `*Enviado por (N1):* ${dados.n1Nome}\n` +
    `*Observação:* ${dados.observacao}\n\n` +
    `🔗 ${dados.link}`
  )
}

function waMensagemDevolvidoN1(dados: {
  n2Nome: string
  nomeAtividade: string
  nomeChecklist: string
  nomeSubgrupo: string
  observacao: string
  link: string
}): string {
  return (
    `🟡 *Plano de Ação devolvido para N1*\n\n` +
    `*Área:* ${dados.nomeSubgrupo}\n` +
    `*Atividade:* ${dados.nomeAtividade}\n` +
    `*Checklist:* ${dados.nomeChecklist}\n` +
    `*Devolvido por (N2):* ${dados.n2Nome}\n` +
    `*Observação:* ${dados.observacao}\n\n` +
    `🔗 ${dados.link}`
  )
}

// ─── Disparo da notificação (compartilhado: rota online + cron de retry) ───────

interface ResultadoNotificacao {
  plano_encontrado: boolean
  wa_enviados: number
  email_enviados: number
  total_destinatarios: number
  erros: string[]
}

/**
 * Dispara WhatsApp + Email para os destinatários elegíveis de um evento de plano.
 * Retorna o resultado (não responde HTTP) para que tanto a rota /notificar quanto
 * o cron de reprocessamento decidam se a abertura pode ser marcada como entregue.
 *
 * Regra de "entregue": `erros` vazio. Erro de canal (Evolution/email fora) mantém
 * a abertura como pendente para o cron reenviar; ausência de destinatário ou
 * supressão por turno conta como concluído (reenviar não ajudaria).
 */
async function dispararNotificacaoPlano(
  sb: SupabaseClient,
  { plano_id, evento, observacao, ator_nome }: {
    plano_id: string
    evento: 'aberto' | 'enviado_n2' | 'devolvido_n1'
    observacao: string
    ator_nome: string
  },
): Promise<ResultadoNotificacao> {
  // 1. Carrega o plano com contexto completo
  const { data: plano } = await sb.from('planos_acao').select(`
    id, subgrupo_id, sla_prazo,
    subgrupos(nome),
    checklist_atividades(nome),
    checklist_execucoes(checklists(nome))
  `).eq('id', plano_id).single()

  if (!plano) return { plano_encontrado: false, wa_enviados: 0, email_enviados: 0, total_destinatarios: 0, erros: [] }

  const nomeSubgrupo  = (plano.subgrupos as any)?.nome ?? '—'
  const nomeAtividade = (plano.checklist_atividades as any)?.nome ?? '—'
  const nomeChecklist = (plano.checklist_execucoes as any)?.checklists?.nome ?? '—'

  // SLA formatado
  let slaFormatado: string | null = null
  if (plano.sla_prazo) {
    const horas = Math.round((new Date(plano.sla_prazo).getTime() - Date.now()) / 3600000)
    slaFormatado = horas > 0 ? `${horas}h para vencer` : `vencido (${Math.abs(horas)}h atrás)`
  }

  // 2. Primeira foto de evidência da abertura (se existir)
  const { data: evidencias } = await sb.from('plano_acao_evidencias')
    .select('url, tipo, ordem')
    .eq('plano_acao_id', plano_id)
    .eq('tipo', 'foto')
    .order('ordem', { ascending: true })
    .limit(1)

  const primeiraFoto: string | null = evidencias?.[0]?.url ?? null

  // 3. Destinatários conforme evento
  const funcoesAlvo = evento === 'enviado_n2'
    ? ['nivel_2']   // N2 recebe quando N1 escala
    : ['nivel_1']   // N1 recebe na abertura e quando N2 devolve

  const { data: membros } = await sb.from('usuario_subgrupo')
    .select('usuario_id, funcao, usuarios(nome, email, telefone)')
    .eq('subgrupo_id', plano.subgrupo_id)
    .in('funcao', funcoesAlvo)

  if (!membros || membros.length === 0) {
    return { plano_encontrado: true, wa_enviados: 0, email_enviados: 0, total_destinatarios: 0, erros: [] }
  }

  // Turno: só suprime WhatsApp para quem tem turno modo 'notificacao' e está
  // fora do horário agora. Modos 'login'/'aviso' não afetam envio; quem não
  // tem turno nunca é restringido. (Email e visibilidade do plano de ação
  // NÃO são afetados pelo turno.)
  const foraDoTurno = new Set<string>()
  await Promise.all(membros.map(async (m: any) => {
    const { data: recebe } = await sb.rpc('usuario_recebe_notificacao', { p_usuario_id: m.usuario_id })
    if (recebe === false) foraDoTurno.add(m.usuario_id)
  }))

  const baseUrl = process.env.APP_URL ?? 'https://app.checkflow.digital'
  const link = `${baseUrl}/gestao/planos-acao/${plano_id}`

  // 3. Busca templates da empresa (fallback hardcoded se não houver)
  const empresaId = await empresaDeSubgrupo(sb, plano.subgrupo_id)
  const tipoNotif = evento === 'aberto' ? 'plano_aberto' as const
    : evento === 'enviado_n2' ? 'plano_enviado_n2' as const
    : 'plano_devolvido_n1' as const
  const [tmplWa, tmplEmail] = empresaId
    ? await Promise.all([
        buscarTemplate(sb, empresaId, tipoNotif, 'whatsapp'),
        buscarTemplate(sb, empresaId, tipoNotif, 'email'),
      ])
    : [null, null]

  // Variáveis de interpolação
  const varsBase = {
    atividade: nomeAtividade,
    checklist: nomeChecklist,
    subgrupo: nomeSubgrupo,
    ator: ator_nome,
    n1: ator_nome,
    n2: ator_nome,
    observacao,
    sla: slaFormatado ?? '',
    linha_sla: slaFormatado ? `\nSLA: ${slaFormatado}` : '',
    link,
  }

  // 4. Envia WhatsApp + Email em paralelo para cada destinatário
  let waEnviados = 0
  let emailEnviados = 0
  const erros: string[] = []

  await Promise.all(membros.map(async (m: any) => {
    const usuario = m.usuarios ?? {}
    const nome: string = usuario.nome ?? '—'
    const email: string | null = usuario.email ?? null
    const telefone: string | null = usuario.telefone ?? null
    const vars = { ...varsBase, destinatario: nome }

    // ── WhatsApp ──
    if (telefone && !foraDoTurno.has(m.usuario_id)) {
      const numero = telefone.replace(/\D/g, '').replace(/^0/, '')
      const numeroFinal = numero.startsWith('55') ? numero : `55${numero}`

      let mensagemWa: string | null = null
      if (tmplWa && tmplWa.ativo) {
        mensagemWa = renderizar(tmplWa.corpo, vars)
      } else if (!tmplWa) {
        mensagemWa = evento === 'aberto'
          ? waMensagemAberto({ atorNome: ator_nome, nomeAtividade, nomeChecklist, nomeSubgrupo, observacao, sla: slaFormatado, link })
          : evento === 'devolvido_n1'
          ? waMensagemDevolvidoN1({ n2Nome: ator_nome, nomeAtividade, nomeChecklist, nomeSubgrupo, observacao, link })
          : waMensagemEnviadoN2({ n1Nome: ator_nome, nomeAtividade, nomeChecklist, nomeSubgrupo, observacao, link })
      }

      if (mensagemWa) {
        const { ok, erro } = primeiraFoto
          ? await enviarWhatsAppMidia({ numero: numeroFinal, imagemUrl: primeiraFoto, caption: mensagemWa })
          : await enviarWhatsApp({ numero: numeroFinal, mensagem: mensagemWa })
        if (ok) waEnviados++
        else erros.push(`WA ${nome}: ${erro}`)
      }
    }

    // ── Email ── (ignora o e-mail técnico não-entregável <cpf>@checkflow.local)
    if (email && !email.endsWith('@checkflow.local')) {
      let assunto: string | null = null
      let html: string | null = null

      if (tmplEmail && tmplEmail.ativo) {
        assunto = renderizar(tmplEmail.assunto ?? `Plano de Ação — ${nomeAtividade}`, vars)
        const corpoHtml = renderizar(tmplEmail.corpo, vars)
          .split('\n').map(l => `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6">${l || '&nbsp;'}</p>`).join('')
        html = buildEmailHtml(assunto, corpoHtml, link, primeiraFoto)
      } else if (!tmplEmail && evento === 'devolvido_n1') {
        // Sem template dedicado — monta e-mail simples inline.
        assunto = `Plano de Ação devolvido para N1 — ${nomeAtividade}`
        const corpo = [
          `Olá ${nome},`,
          `O plano de ação de <strong>${nomeAtividade}</strong> (${nomeChecklist}) foi devolvido para N1 por ${ator_nome}.`,
          `Área: ${nomeSubgrupo}`,
          `Observação: ${observacao}`,
        ].map(l => `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6">${l}</p>`).join('')
        html = buildEmailHtml(assunto, corpo, link)
      } else if (!tmplEmail) {
        const tpl = evento === 'aberto'
          ? emailPlanoAberto({ nomeDestinatario: nome, nomeAtividade, nomeChecklist, nomeSubgrupo, observacao, atorNome: ator_nome, sla: slaFormatado, planoId: plano_id, fotoUrl: primeiraFoto })
          : emailPlanoEnviadoN2({ nomeDestinatario: nome, nomeAtividade, nomeChecklist, nomeSubgrupo, observacao, n1Nome: ator_nome, planoId: plano_id, fotoUrl: primeiraFoto })
        assunto = tpl.assunto
        html = tpl.html
      }

      if (assunto && html) {
        const { ok, erro } = await enviarEmail({ para: email, assunto, html })
        if (ok) emailEnviados++
        else erros.push(`Email ${nome}: ${erro}`)
      }
    }
  }))

  return {
    plano_encontrado: true,
    wa_enviados: waEnviados,
    email_enviados: emailEnviados,
    total_destinatarios: membros.length,
    erros,
  }
}

function svcClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { realtime: { transport: ws as any } }
  )
}

// Marca a abertura como notificada apenas se ainda estiver pendente (idempotente).
async function marcarAbertoNotificado(sb: SupabaseClient, plano_id: string): Promise<void> {
  await sb.from('planos_acao')
    .update({ aberto_notificado_em: new Date().toISOString() })
    .eq('id', plano_id)
    .is('aberto_notificado_em', null)
}

// ─── Rotas ─────────────────────────────────────────────────────────────────────

export async function planosAcaoRoutes(app: FastifyInstance) {

  /**
   * POST /planos-acao/notificar
   *
   * Body:
   *   plano_id   — UUID do plano de ação
   *   evento     — 'aberto' | 'enviado_n2' | 'devolvido_n1'
   *   observacao — texto da movimentação
   *   ator_nome  — nome de quem disparou o evento
   *
   * Dispara WhatsApp + Email em paralelo para cada destinatário elegível.
   * Erros de canal são silenciados — nunca quebra o fluxo principal. Para o
   * evento 'aberto', marca aberto_notificado_em quando entregue (sem erro); se
   * a Evolution estiver fora, deixa pendente para o cron reenviar.
   */
  app.post('/planos-acao/notificar', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    const { plano_id, evento, observacao, ator_nome } = req.body as {
      plano_id: string
      evento: 'aberto' | 'enviado_n2' | 'devolvido_n1'
      observacao: string
      ator_nome: string
    }

    if (!plano_id || !evento) {
      return reply.status(400).send({ error: 'plano_id e evento são obrigatórios' })
    }

    const sb = svcClient()
    const r = await dispararNotificacaoPlano(sb, { plano_id, evento, observacao, ator_nome })
    if (!r.plano_encontrado) return reply.status(404).send({ error: 'Plano não encontrado' })

    if (evento === 'aberto' && r.erros.length === 0) {
      await marcarAbertoNotificado(sb, plano_id)
    }

    return reply.send({
      wa_enviados: r.wa_enviados,
      email_enviados: r.email_enviados,
      total_destinatarios: r.total_destinatarios,
      erros: r.erros.length > 0 ? r.erros : undefined,
    })
  })

  /**
   * POST /cron/reprocessar-aberturas-plano — disparo agendado (ex.: a cada 10 min)
   *
   * Reenvia a notificação de ABERTURA dos planos cujo aviso ainda não foi
   * confirmado (aberto_notificado_em IS NULL). Cobre o caso de Evolution/WhatsApp
   * fora no momento do disparo — sobretudo planos criados OFFLINE e sincronizados
   * depois. Protegido por x-cron-secret (env CRON_SECRET), mesmo padrão de
   * /cron/limpeza-execucoes. Service role → sem dependência de RLS.
   */
  app.post('/cron/reprocessar-aberturas-plano', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) {
      return reply.status(401).send({ error: 'Não autorizado' })
    }

    const sb = svcClient()

    // Janela de 2 dias: além disso considera-se perdido (evita retry infinito de
    // número inválido). Lote limitado; o cron drena o acúmulo aos poucos.
    const desde = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const { data: pendentes } = await sb.from('planos_acao')
      .select('id, observacao_abertura, criado_por')
      .is('aberto_notificado_em', null)
      .gt('created_at', desde)
      .order('created_at', { ascending: true })
      .limit(100)

    if (!pendentes || pendentes.length === 0) {
      return reply.send({ ok: true, verificados: 0, reenviados: 0, ainda_pendentes: 0 })
    }

    // Nome do ator (criador do plano) em lote, para a mensagem "Aberto por".
    const criadorIds = [...new Set(pendentes.map((p: any) => p.criado_por).filter(Boolean))]
    const { data: criadores } = criadorIds.length > 0
      ? await sb.from('usuarios').select('id, nome').in('id', criadorIds)
      : { data: [] as { id: string; nome: string }[] }
    const nomePorId = new Map((criadores ?? []).map((u: any) => [u.id, u.nome]))

    let reenviados = 0
    for (const p of pendentes as any[]) {
      const atorNome = nomePorId.get(p.criado_por) ?? 'Operador'
      const r = await dispararNotificacaoPlano(sb, {
        plano_id: p.id,
        evento: 'aberto',
        observacao: p.observacao_abertura ?? '',
        ator_nome: atorNome,
      })
      if (r.plano_encontrado && r.erros.length === 0) {
        await marcarAbertoNotificado(sb, p.id)
        reenviados++
      }
    }

    return reply.send({
      ok: true,
      verificados: pendentes.length,
      reenviados,
      ainda_pendentes: pendentes.length - reenviados,
    })
  })
}

function buildEmailHtml(assunto: string, corpoHtml: string, link: string, fotoUrl?: string | null): string {
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
          <a href="${link}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#f97316;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px">Ver no CheckFlow →</a>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#fafafa">
          <p style="margin:0;font-size:11px;color:#9ca3af">Email automático — não responda.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
