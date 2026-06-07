import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import { enviarWhatsApp, enviarWhatsAppMidia } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { emailPlanoAberto, emailPlanoEnviadoN2 } from '../lib/email-templates'

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
      process.env.SUPABASE_SECRET_KEY!
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
      ? ['nivel_1', 'nivel_2']  // N2 também modera como N1
      : ['nivel_2']

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

    const baseUrl = process.env.APP_URL ?? 'https://checkflow-production-b19d.up.railway.app'
    const link = `${baseUrl}/gestao/planos-acao/${plano_id}`

    // 3. Envia WhatsApp + Email em paralelo para cada destinatário
    let waEnviados = 0
    let emailEnviados = 0
    const erros: string[] = []

    await Promise.all(membros.map(async (m: any) => {
      const usuario = m.usuarios ?? {}
      const nome: string = usuario.nome ?? '—'
      const email: string | null = usuario.email ?? null
      const telefone: string | null = usuario.telefone ?? null

      // ── WhatsApp (respeita turno: pula envio se usuário está fora do turno) ──
      if (telefone && !foraDoTurno.has(m.usuario_id)) {
        const numero = telefone.replace(/\D/g, '').replace(/^0/, '')
        const numeroFinal = numero.startsWith('55') ? numero : `55${numero}`

        const caption = evento === 'aberto'
          ? waMensagemAberto({ atorNome: ator_nome, nomeAtividade, nomeChecklist, nomeSubgrupo, observacao, sla: slaFormatado, link })
          : waMensagemEnviadoN2({ n1Nome: ator_nome, nomeAtividade, nomeChecklist, nomeSubgrupo, observacao, link })

        // Envia com imagem se tiver foto, senão envia só texto
        const { ok, erro } = primeiraFoto
          ? await enviarWhatsAppMidia({ numero: numeroFinal, imagemUrl: primeiraFoto, caption })
          : await enviarWhatsApp({ numero: numeroFinal, mensagem: caption })

        if (ok) waEnviados++
        else erros.push(`WA ${nome}: ${erro}`)
      }

      // ── Email ──
      if (email) {
        const template = evento === 'aberto'
          ? emailPlanoAberto({ nomeDestinatario: nome, nomeAtividade, nomeChecklist, nomeSubgrupo, observacao, atorNome: ator_nome, sla: slaFormatado, planoId: plano_id, fotoUrl: primeiraFoto })
          : emailPlanoEnviadoN2({ nomeDestinatario: nome, nomeAtividade, nomeChecklist, nomeSubgrupo, observacao, n1Nome: ator_nome, planoId: plano_id, fotoUrl: primeiraFoto })

        const { ok, erro } = await enviarEmail({ para: email, ...template })
        if (ok) emailEnviados++
        else erros.push(`Email ${nome}: ${erro}`)
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
