import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
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

// ─── Rota ────────────────────────────────────────────────────────────────────

export async function planosAcaoRoutes(app: FastifyInstance) {

  /**
   * POST /planos-acao/notificar
   *
   * Body:
   *   plano_id   — UUID do plano de ação
   *   evento     — 'aberto' | 'enviado_n2'
   *   observacao — texto da movimentação
   *   ator_nome  — nome de quem disparou o evento
   *
   * Dispara WhatsApp + Email em paralelo para cada destinatário elegível.
   * Erros de canal são silenciados — nunca quebra o fluxo principal.
   */
  app.post('/planos-acao/notificar', async (req, reply) => {
    const { plano_id, evento, observacao, ator_nome } = req.body as {
      plano_id: string
      evento: 'aberto' | 'enviado_n2'
      observacao: string
      ator_nome: string
    }

    if (!plano_id || !evento) {
      return reply.status(400).send({ error: 'plano_id e evento são obrigatórios' })
    }

    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { realtime: { transport: ws as any } }
    )

    // 1. Carrega o plano com contexto completo
    const { data: plano } = await sb.from('planos_acao').select(`
      id, subgrupo_id, sla_prazo,
      subgrupos(nome),
      checklist_atividades(nome),
      checklist_execucoes(checklists(nome))
    `).eq('id', plano_id).single()

    if (!plano) return reply.status(404).send({ error: 'Plano não encontrado' })

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
    const funcoesAlvo = evento === 'aberto'
      ? ['nivel_1']   // apenas N1 recebe quando o plano é aberto
      : ['nivel_2']   // N2 só recebe quando N1 escala

    const { data: membros } = await sb.from('usuario_subgrupo')
      .select('usuario_id, funcao, usuarios(nome, email, telefone)')
      .eq('subgrupo_id', plano.subgrupo_id)
      .in('funcao', funcoesAlvo)

    if (!membros || membros.length === 0) {
      return reply.send({ enviados: 0, motivo: 'Nenhum destinatário encontrado' })
    }

    // Turno: usuários com turno cadastrado só recebem WhatsApp se estiverem
    // dentro do horário do turno agora. Quem não tem turno nunca é restringido.
    // (Email e visibilidade do plano de ação NÃO são afetados pelo turno.)
    const foraDoTurno = new Set<string>()
    await Promise.all(membros.map(async (m: any) => {
      const { data: dentro } = await sb.rpc('usuario_esta_no_turno', { p_usuario_id: m.usuario_id })
      if (dentro === false) foraDoTurno.add(m.usuario_id)
    }))

    const baseUrl = process.env.APP_URL ?? 'https://web-production-36880.up.railway.app'
    const link = `${baseUrl}/gestao/planos-acao/${plano_id}`

    // 3. Busca templates da empresa
    const empresaId = await empresaDeSubgrupo(sb, plano.subgrupo_id)
    const tipoNotif = evento === 'aberto' ? 'plano_aberto' as const : 'plano_enviado_n2' as const
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
          html = buildEmailHtml(assunto, corpoHtml, link)
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

    return reply.send({
      wa_enviados: waEnviados,
      email_enviados: emailEnviados,
      total_destinatarios: membros.length,
      erros: erros.length > 0 ? erros : undefined,
    })
  })
}

function buildEmailHtml(assunto: string, corpoHtml: string, link: string): string {
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
