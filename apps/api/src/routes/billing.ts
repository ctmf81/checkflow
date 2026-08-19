import { FastifyInstance } from 'fastify'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import {
  asaasCriarCliente, asaasCriarAssinatura, asaasCriarCobranca, asaasCancelarAssinatura,
  asaasPagamentosDaAssinatura, asaasDeletarCobranca, asaasAtualizarAssinatura,
  type BillingType, type Cycle, type SplitItem,
} from '../lib/asaas'
import { enviarWhatsApp } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { emailFaturaVencida } from '../lib/email-templates'
import { buscarAdminsEmpresa, notificarAdmins } from '../lib/adminEmpresa'
import { montarSplit, vencimentoAncora, dataCorteCarencia, calcularProRata } from '../lib/billingParceiro'

const ADMIN_SISTEMA_ID = '00000000-0000-0000-0000-000000000001'
const ADMIN_EMPRESA_ID = '00000000-0000-0000-0000-000000000002'

const BILLING_TYPES: BillingType[] = ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED']

function hojeMais(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export async function billingRoutes(app: FastifyInstance) {
  const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
    { realtime: { transport: ws as any } })

  // Valida o token do usuário e confirma que ele é Admin da empresa (ou admin_sistema)
  async function autorizarAdminEmpresa(supabase: SupabaseClient, authHeader: string | undefined, empresaId: string): Promise<{ userId: string } | null> {
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return null
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return null
    if (user.app_metadata?.role === 'admin_sistema') return { userId: user.id }
    const { data } = await supabase.from('usuario_empresa')
      .select('perfil_id').eq('usuario_id', user.id).eq('empresa_id', empresaId).maybeSingle()
    if (data?.perfil_id === ADMIN_EMPRESA_ID || data?.perfil_id === ADMIN_SISTEMA_ID) return { userId: user.id }
    return null
  }

  // Garante um cliente Asaas para a empresa; persiste o id na assinatura
  async function garantirClienteAsaas(supabase: SupabaseClient, empresaId: string): Promise<string> {
    const { data: assin } = await supabase.from('empresa_assinaturas')
      .select('asaas_customer_id').eq('empresa_id', empresaId).maybeSingle()
    if (assin?.asaas_customer_id) return assin.asaas_customer_id

    const { data: emp } = await supabase.from('empresas').select('nome, cnpj').eq('id', empresaId).single()
    if (!emp) throw new Error('Empresa não encontrada')

    // e-mail do admin da empresa (opcional para o Asaas)
    const { data: adminVinc } = await supabase.from('usuario_empresa')
      .select('usuarios(email)').eq('empresa_id', empresaId).eq('perfil_id', ADMIN_EMPRESA_ID).limit(1).maybeSingle()
    const email = (adminVinc as any)?.usuarios?.email ?? undefined

    const cliente = await asaasCriarCliente({
      name: emp.nome,
      cpfCnpj: (emp.cnpj ?? '').replace(/\D/g, ''),
      email,
      externalReference: empresaId,
    })
    await supabase.from('empresa_assinaturas')
      .update({ asaas_customer_id: cliente.id, atualizado_em: new Date().toISOString() })
      .eq('empresa_id', empresaId)
    return cliente.id
  }

  // Monta o split de parceiro para a mensalidade, se a empresa tem parceiro
  // ativo COM wallet Asaas e percentual > 0. Sem isso, retorna undefined
  // (cobrança 100% CheckFlow — fallback seguro). Repasse só na assinatura.
  async function montarSplitParceiro(supabase: SupabaseClient, empresaId: string): Promise<SplitItem[] | undefined> {
    // parceiro_id/percentual vivem em empresa_financeiro (migration 20260613002351
    // moveu de empresas p/ tabela admin-only). Service role ignora RLS.
    const { data: fin } = await supabase.from('empresa_financeiro')
      .select('parceiro_percentual, parceiros:parceiro_id ( asaas_wallet_id, status )')
      .eq('empresa_id', empresaId).maybeSingle()
    const parc = (fin as any)?.parceiros
    return montarSplit({
      percentual: (fin as any)?.parceiro_percentual,
      walletId: parc?.asaas_wallet_id,
      statusParceiro: parc?.status,
    })
  }

  // ── POST /billing/assinar ─────────────────────────────────────────────────
  // Assina um plano PAGO (cria/atualiza a assinatura recorrente no Asaas).
  app.post('/billing/assinar', async (req, reply) => {
    const { empresaId, planoId, billingType } = req.body as { empresaId?: string; planoId?: string; billingType?: BillingType }
    if (!empresaId || !planoId) return reply.status(400).send({ error: 'empresaId e planoId são obrigatórios' })
    const tipoCobranca: BillingType = BILLING_TYPES.includes(billingType as BillingType) ? billingType! : 'UNDEFINED'

    const supabase = sb()
    const auth = await autorizarAdminEmpresa(supabase, req.headers.authorization, empresaId)
    if (!auth) return reply.status(403).send({ error: 'Não autorizado' })

    const { data: plano } = await supabase.from('planos')
      .select('id, nome, tipo, valor, ciclo, dias_trial, limite_execucoes_mes, limite_armazenamento_bytes, limite_tokens_ia_mes')
      .eq('id', planoId).maybeSingle()
    if (!plano) return reply.status(404).send({ error: 'Plano não encontrado' })
    if (plano.tipo !== 'pago') return reply.status(400).send({ error: 'Apenas planos pagos geram assinatura no Asaas' })

    const cycle: Cycle = plano.ciclo === 'anual' ? 'YEARLY' : 'MONTHLY'

    try {
      const customer = await garantirClienteAsaas(supabase, empresaId)

      const { data: assinAtual } = await supabase.from('empresa_assinaturas')
        .select('asaas_subscription_id, asaas_customer_id, ja_usou_trial, plano_tipo, status, periodo_fim, plano_id, valor, ciclo')
        .eq('empresa_id', empresaId).maybeSingle()

      // ── Troca ENTRE planos pagos ──
      // - UPGRADE imediato (mesmo ciclo, valor maior, calcularProRata retorna cobrança ≥ piso):
      //   cobra a diferença proporcional AGORA e aplica o plano novo NA HORA (mantém periodo_fim
      //   e execucoes_usadas — cliente já pagou até lá).
      // - Downgrade / mudança de ciclo / valor abaixo do piso / período expirado:
      //   AGENDA pra virada do período (comportamento antigo — sem crédito/refund).
      if (assinAtual && assinAtual.plano_tipo === 'pago' && assinAtual.status === 'ativo' && assinAtual.asaas_subscription_id) {
        const proRata = calcularProRata({
          valorAtual: Number((assinAtual as any).valor ?? 0),
          valorNovo: Number(plano.valor),
          cicloAtual: (assinAtual as any).ciclo,
          cicloNovo: plano.ciclo,
          periodoFim: assinAtual.periodo_fim!,
          hoje: new Date().toISOString().slice(0, 10),
        })

        // ── Caminho 1: UPGRADE IMEDIATO com cobrança avulsa ─────────────────
        if (proRata) {
          const customer = (assinAtual as any).asaas_customer_id as string ?? await garantirClienteAsaas(supabase, empresaId)
          const split = await montarSplitParceiro(supabase, empresaId)

          let cobrancaUpg: any
          try {
            cobrancaUpg = await asaasCriarCobranca({
              customer,
              billingType: tipoCobranca,
              value: proRata.valor,
              dueDate: hojeMais(3),
              description: `Upgrade para o plano ${plano.nome} — diferença proporcional (${proRata.diasRestantes} dias)`,
              externalReference: empresaId,
              ...(split ? { split } : {}),
            })
          } catch (e: any) {
            app.log.error(e)
            return reply.status(502).send({ error: e?.message ?? 'Falha ao gerar cobrança de upgrade' })
          }

          // Atualiza a assinatura no Asaas — próximas cobranças no valor novo.
          // Se falhar, rollback da cobrança avulsa criada (não deixa cobrança órfã).
          try {
            await asaasAtualizarAssinatura(assinAtual.asaas_subscription_id, {
              value: Number(plano.valor), cycle, billingType: tipoCobranca, updatePendingPayments: false,
              split: split ?? [],
            })
          } catch (e: any) {
            app.log.error(e)
            try { await asaasDeletarCobranca(cobrancaUpg.id) } catch { /* ignora */ }
            return reply.status(502).send({ error: e?.message ?? 'Falha ao atualizar a assinatura no Asaas' })
          }

          // Aplica o plano novo IMEDIATAMENTE. Preserva periodo_inicio/periodo_fim
          // (cliente pagou até lá) e execucoes_usadas/tokens_ia_usados (já consumidos
          // no ciclo). Só troca a identidade + limites.
          await supabase.from('empresa_assinaturas').update({
            plano_id: plano.id, plano_nome: plano.nome, plano_tipo: plano.tipo,
            valor: plano.valor, ciclo: plano.ciclo,
            limite_execucoes_mes: plano.limite_execucoes_mes,
            limite_armazenamento_bytes: plano.limite_armazenamento_bytes,
            limite_tokens_ia_mes: plano.limite_tokens_ia_mes,
            proximo_plano_id: null, troca_efetiva_em: null,
            atualizado_em: new Date().toISOString(),
          }).eq('empresa_id', empresaId)

          await supabase.from('empresa_cobrancas').upsert({
            empresa_id: empresaId,
            tipo: 'upgrade',
            asaas_payment_id: cobrancaUpg.id,
            asaas_subscription_id: assinAtual.asaas_subscription_id,
            descricao: `Upgrade para ${plano.nome} — diferença proporcional`,
            valor: cobrancaUpg.value,
            billing_type: cobrancaUpg.billingType,
            status: cobrancaUpg.status,
            vencimento: cobrancaUpg.dueDate,
            invoice_url: cobrancaUpg.invoiceUrl,
          }, { onConflict: 'asaas_payment_id' })

          return reply.send({
            ok: true, upgrade_imediato: true,
            valorProRata: proRata.valor, diasRestantes: proRata.diasRestantes,
            invoiceUrl: cobrancaUpg.invoiceUrl,
          })
        }

        // ── Caminho 2: agenda a troca pra virada do período (comportamento antigo) ──
        try {
          const splitTroca = await montarSplitParceiro(supabase, empresaId)
          await asaasAtualizarAssinatura(assinAtual.asaas_subscription_id, {
            value: Number(plano.valor), cycle, billingType: tipoCobranca, updatePendingPayments: false,
            split: splitTroca ?? [],
          })
        } catch (e: any) {
          app.log.error(e)
          return reply.status(502).send({ error: e?.message ?? 'Falha ao atualizar a assinatura no Asaas' })
        }
        await supabase.from('empresa_assinaturas').update({
          proximo_plano_id: plano.id,
          troca_efetiva_em: assinAtual.periodo_fim,
          atualizado_em: new Date().toISOString(),
        }).eq('empresa_id', empresaId)
        return reply.send({ ok: true, agendado: true, efetivaEm: assinAtual.periodo_fim })
      }

      // ── 1ª contratação de plano pago (vindo de trial/gratuito/nenhum): imediata ──
      // cancela assinatura anterior, se houver — e remove as cobranças ainda
      // não pagas dela (o Asaas não apaga automaticamente ao cancelar)
      if (assinAtual?.asaas_subscription_id) {
        const subAntiga = assinAtual.asaas_subscription_id
        try {
          const pendentes = await asaasPagamentosDaAssinatura(subAntiga)
          for (const p of pendentes.data ?? []) {
            if (['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'].includes(p.status)) {
              try { await asaasDeletarCobranca(p.id) } catch { /* ignora */ }
            }
          }
        } catch { /* ignora */ }
        try { await asaasCancelarAssinatura(subAntiga) } catch { /* ignora */ }
        // marca as cobranças locais não pagas dessa assinatura como canceladas
        await supabase.from('empresa_cobrancas')
          .update({ status: 'CANCELLED', atualizado_em: new Date().toISOString() })
          .eq('asaas_subscription_id', subAntiga).is('pago_em', null)
      }

      const split = await montarSplitParceiro(supabase, empresaId)
      const assinatura = await asaasCriarAssinatura({
        customer,
        billingType: tipoCobranca,
        value: Number(plano.valor),
        nextDueDate: hojeMais(1),
        cycle,
        description: `CheckFlow — plano ${plano.nome}`,
        externalReference: empresaId,
        ...(split ? { split } : {}),
      })

      // NÃO ativa o plano ainda: guarda como PENDENTE de 1º pagamento + o vínculo
      // Asaas. A empresa mantém o acesso atual (trial/carência) até pagar; o
      // snapshot do plano (limites + status 'ativo') é aplicado no webhook quando
      // o pagamento confirma (evita "usar sem pagar"). Assume que a linha existe
      // (criada na abertura da empresa; garantirClienteAsaas já dependia disso).
      await supabase.from('empresa_assinaturas').update({
        pendente_plano_id: plano.id,
        proximo_plano_id: null, troca_efetiva_em: null,
        asaas_customer_id: customer,
        asaas_subscription_id: assinatura.id,
        atualizado_em: new Date().toISOString(),
      }).eq('empresa_id', empresaId)

      // Busca a 1ª cobrança da assinatura para já devolver o link de pagamento
      // e semear o registro local (o webhook depois atualiza o status).
      let invoiceUrl: string | undefined
      try {
        const pagamentos = await asaasPagamentosDaAssinatura(assinatura.id)
        const primeira = pagamentos.data?.[0]
        if (primeira) {
          invoiceUrl = primeira.invoiceUrl
          await supabase.from('empresa_cobrancas').upsert({
            empresa_id: empresaId,
            tipo: 'assinatura',
            asaas_payment_id: primeira.id,
            asaas_subscription_id: assinatura.id,
            descricao: `Plano ${plano.nome}`,
            valor: primeira.value,
            billing_type: primeira.billingType,
            status: primeira.status,
            vencimento: primeira.dueDate,
            invoice_url: primeira.invoiceUrl,
          }, { onConflict: 'asaas_payment_id' })
        }
      } catch { /* o webhook PAYMENT_CREATED registra a cobrança de qualquer forma */ }

      return reply.send({ ok: true, subscriptionId: assinatura.id, invoiceUrl, aguardandoPagamento: true })
    } catch (e: any) {
      app.log.error(e)
      return reply.status(502).send({ error: e?.message ?? 'Falha ao criar assinatura no Asaas' })
    }
  })

  // ── POST /billing/cancelar-pendente ───────────────────────────────────────
  // Desiste de uma assinatura que está AGUARDANDO o 1º pagamento (ex.: escolheu
  // cartão e quer trocar por PIX). Cancela a assinatura no Asaas, apaga as
  // cobranças ainda não pagas e limpa o plano pendente — a empresa volta ao
  // estado anterior e pode assinar de novo com outra forma de pagamento.
  // Não faz nada se já não há pendência (ex.: o pagamento acabou de confirmar).
  app.post('/billing/cancelar-pendente', async (req, reply) => {
    const { empresaId } = req.body as { empresaId?: string }
    if (!empresaId) return reply.status(400).send({ error: 'empresaId é obrigatório' })

    const supabase = sb()
    const auth = await autorizarAdminEmpresa(supabase, req.headers.authorization, empresaId)
    if (!auth) return reply.status(403).send({ error: 'Não autorizado' })

    const { data: assin } = await supabase.from('empresa_assinaturas')
      .select('pendente_plano_id, asaas_subscription_id').eq('empresa_id', empresaId).maybeSingle()
    if (!(assin as any)?.pendente_plano_id) {
      return reply.send({ ok: true, nada: true }) // sem pendência (talvez já pagou)
    }

    const sub = (assin as any).asaas_subscription_id as string | null
    if (sub) {
      try {
        const pendentes = await asaasPagamentosDaAssinatura(sub)
        for (const p of pendentes.data ?? []) {
          if (['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'].includes(p.status)) {
            try { await asaasDeletarCobranca(p.id) } catch { /* ignora */ }
          }
        }
      } catch { /* ignora */ }
      try { await asaasCancelarAssinatura(sub) } catch { /* ignora */ }
      await supabase.from('empresa_cobrancas')
        .update({ status: 'CANCELLED', atualizado_em: new Date().toISOString() })
        .eq('asaas_subscription_id', sub).is('pago_em', null)
    }

    await supabase.from('empresa_assinaturas').update({
      pendente_plano_id: null,
      asaas_subscription_id: null,
      atualizado_em: new Date().toISOString(),
    }).eq('empresa_id', empresaId)

    return reply.send({ ok: true })
  })

  // ── POST /billing/cancelar ────────────────────────────────────────────────
  // Cancela uma assinatura PAGA ativa. Para as cobranças futuras no Asaas AGORA,
  // mas o acesso continua até o FIM do período já pago (grava cancelar_em =
  // periodo_fim); na virada, avancar_periodo_assinatura efetiva (status=cancelado
  // → fase carência = somente leitura). Reversível via /billing/reativar.
  app.post('/billing/cancelar', async (req, reply) => {
    const { empresaId } = req.body as { empresaId?: string }
    if (!empresaId) return reply.status(400).send({ error: 'empresaId é obrigatório' })

    const supabase = sb()
    const auth = await autorizarAdminEmpresa(supabase, req.headers.authorization, empresaId)
    if (!auth) return reply.status(403).send({ error: 'Não autorizado' })

    const { data: a } = await supabase.from('empresa_assinaturas')
      .select('plano_tipo, status, asaas_subscription_id, periodo_fim, cancelar_em')
      .eq('empresa_id', empresaId).maybeSingle()
    if (!a) return reply.status(404).send({ error: 'Empresa sem assinatura' })
    const at = a as any
    if (at.plano_tipo !== 'pago' || !['ativo', 'inadimplente'].includes(at.status)) {
      return reply.status(400).send({ error: 'Só uma assinatura paga ativa pode ser cancelada.' })
    }
    if (at.cancelar_em) return reply.send({ ok: true, jaAgendado: true, efetivaEm: at.periodo_fim })

    // Para a recorrência no Asaas + apaga cobranças ainda não pagas (best-effort).
    if (at.asaas_subscription_id) {
      try {
        const pend = await asaasPagamentosDaAssinatura(at.asaas_subscription_id)
        for (const p of pend.data ?? []) {
          if (['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'].includes(p.status)) {
            try { await asaasDeletarCobranca(p.id) } catch { /* ignora */ }
          }
        }
      } catch { /* ignora */ }
      try { await asaasCancelarAssinatura(at.asaas_subscription_id) } catch { /* ignora */ }
    }

    await supabase.from('empresa_assinaturas').update({
      cancelar_em: at.periodo_fim,
      atualizado_em: new Date().toISOString(),
    }).eq('empresa_id', empresaId)

    return reply.send({ ok: true, efetivaEm: at.periodo_fim })
  })

  // ── POST /billing/reativar ────────────────────────────────────────────────
  // Desfaz um cancelamento agendado (antes do período virar): recria a assinatura
  // recorrente no Asaas com a 1ª cobrança só no FIM do período atual (sem cobrar
  // de novo agora) e limpa cancelar_em.
  app.post('/billing/reativar', async (req, reply) => {
    const { empresaId, billingType } = req.body as { empresaId?: string; billingType?: BillingType }
    if (!empresaId) return reply.status(400).send({ error: 'empresaId é obrigatório' })

    const supabase = sb()
    const auth = await autorizarAdminEmpresa(supabase, req.headers.authorization, empresaId)
    if (!auth) return reply.status(403).send({ error: 'Não autorizado' })

    const { data: a } = await supabase.from('empresa_assinaturas')
      .select('plano_nome, valor, ciclo, periodo_fim, cancelar_em')
      .eq('empresa_id', empresaId).maybeSingle()
    const at = a as any
    if (!at?.cancelar_em) return reply.send({ ok: true, nada: true })

    const tipoCobranca: BillingType = ['PIX', 'CREDIT_CARD', 'BOLETO'].includes(billingType as string) ? billingType! : 'PIX'
    try {
      const customer = await garantirClienteAsaas(supabase, empresaId)
      const split = await montarSplitParceiro(supabase, empresaId)
      const nova = await asaasCriarAssinatura({
        customer,
        billingType: tipoCobranca,
        value: Number(at.valor),
        nextDueDate: at.periodo_fim,  // resume no fim do período atual (sem cobrança imediata)
        cycle: at.ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
        description: `CheckFlow — plano ${at.plano_nome}`,
        externalReference: empresaId,
        ...(split ? { split } : {}),
      })
      await supabase.from('empresa_assinaturas').update({
        cancelar_em: null,
        asaas_subscription_id: nova.id,
        atualizado_em: new Date().toISOString(),
      }).eq('empresa_id', empresaId)
      return reply.send({ ok: true })
    } catch (e: any) {
      app.log.error(e)
      return reply.status(502).send({ error: e?.message ?? 'Falha ao reativar no Asaas' })
    }
  })

  // ── POST /billing/sincronizar-split ───────────────────────────────────────
  // Empurra o estado ATUAL do split de parceiro para a assinatura Asaas já
  // existente — sem trocar de plano. Chamado quando o vínculo empresa↔parceiro
  // muda (aba Parceiro em /sistema/empresas/[id]): associar um parceiro DEPOIS
  // da contratação passa a valer nas próximas cobranças; desassociar limpa (`[]`).
  app.post('/billing/sincronizar-split', async (req, reply) => {
    const { empresaId } = req.body as { empresaId?: string }
    if (!empresaId) return reply.status(400).send({ error: 'empresaId é obrigatório' })

    const supabase = sb()
    const auth = await autorizarAdminEmpresa(supabase, req.headers.authorization, empresaId)
    if (!auth) return reply.status(403).send({ error: 'Não autorizado' })

    const { data: a } = await supabase.from('empresa_assinaturas')
      .select('asaas_subscription_id').eq('empresa_id', empresaId).maybeSingle()
    const sub = (a as any)?.asaas_subscription_id as string | null
    if (!sub) return reply.send({ ok: true, semAssinatura: true })

    try {
      const split = await montarSplitParceiro(supabase, empresaId)
      await asaasAtualizarAssinatura(sub, { split: split ?? [], updatePendingPayments: false })
      return reply.send({ ok: true, aplicado: !!split })
    } catch (e: any) {
      app.log.error(e)
      return reply.status(502).send({ error: e?.message ?? 'Falha ao sincronizar o split no Asaas' })
    }
  })

  // ── POST /billing/preview-troca ───────────────────────────────────────────
  // Antes do cliente confirmar a troca de plano, devolve o que vai acontecer:
  // "upgrade_imediato" com valor da cobrança da diferença OU "agendado" pra
  // virada do período. Sem efeito colateral — só simula. Usado pela UI pra
  // montar o texto do confirm com o valor exato.
  app.post('/billing/preview-troca', async (req, reply) => {
    const { empresaId, planoId } = req.body as { empresaId?: string; planoId?: string }
    if (!empresaId || !planoId) return reply.status(400).send({ error: 'empresaId e planoId são obrigatórios' })

    const supabase = sb()
    const auth = await autorizarAdminEmpresa(supabase, req.headers.authorization, empresaId)
    if (!auth) return reply.status(403).send({ error: 'Não autorizado' })

    const [assinRes, planoRes] = await Promise.all([
      supabase.from('empresa_assinaturas')
        .select('plano_tipo, status, valor, ciclo, periodo_fim').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('planos').select('valor, ciclo').eq('id', planoId).maybeSingle(),
    ])
    const at = assinRes.data as any
    const pn = planoRes.data as any
    if (!at || !pn) return reply.status(404).send({ error: 'Assinatura ou plano não encontrado' })
    if (at.plano_tipo !== 'pago' || at.status !== 'ativo') {
      return reply.send({ modo: 'primeira-contratacao' })
    }

    const proRata = calcularProRata({
      valorAtual: Number(at.valor ?? 0),
      valorNovo: Number(pn.valor),
      cicloAtual: at.ciclo, cicloNovo: pn.ciclo,
      periodoFim: at.periodo_fim,
      hoje: new Date().toISOString().slice(0, 10),
    })
    if (proRata) {
      return reply.send({
        modo: 'upgrade-imediato',
        valorProRata: proRata.valor,
        diasRestantes: proRata.diasRestantes,
        valorNovoCiclo: Number(pn.valor),
        cicloNovo: pn.ciclo,
      })
    }
    return reply.send({ modo: 'agendado', efetivaEm: at.periodo_fim, valorNovoCiclo: Number(pn.valor), cicloNovo: pn.ciclo })
  })

  // ── POST /billing/link-atualizar-pagamento ────────────────────────────────
  // Devolve a URL de uma fatura do Asaas onde o cliente pode atualizar a forma
  // de pagamento (trocar cartão vencido, pagar com PIX no lugar de cartão etc.).
  // Preferência: OVERDUE > PENDING > AWAITING_RISK_ANALYSIS da assinatura ativa.
  // Se não houver nenhuma cobrança em aberto (ex.: cartão foi debitado sozinho e
  // a próxima só é gerada no fim do período), devolve 409 com mensagem amigável.
  app.post('/billing/link-atualizar-pagamento', async (req, reply) => {
    const { empresaId } = req.body as { empresaId?: string }
    if (!empresaId) return reply.status(400).send({ error: 'empresaId é obrigatório' })

    const supabase = sb()
    const auth = await autorizarAdminEmpresa(supabase, req.headers.authorization, empresaId)
    if (!auth) return reply.status(403).send({ error: 'Não autorizado' })

    const { data: a } = await supabase.from('empresa_assinaturas')
      .select('asaas_subscription_id, plano_tipo, status').eq('empresa_id', empresaId).maybeSingle()
    const at = a as any
    if (!at?.asaas_subscription_id) return reply.status(400).send({ error: 'Empresa sem assinatura ativa no Asaas.' })
    if (at.plano_tipo !== 'pago') return reply.status(400).send({ error: 'Sem assinatura paga.' })

    try {
      const pagamentos = await asaasPagamentosDaAssinatura(at.asaas_subscription_id)
      const prioridade = ['OVERDUE', 'PENDING', 'AWAITING_RISK_ANALYSIS']
      const emAberto = (pagamentos.data ?? [])
        .filter(p => prioridade.includes(p.status) && !!p.invoiceUrl)
        .sort((x, y) => prioridade.indexOf(x.status) - prioridade.indexOf(y.status))
      const escolhida = emAberto[0]
      if (!escolhida) {
        return reply.status(409).send({
          error: 'Sem cobrança em aberto no momento. Você poderá atualizar a forma de pagamento na próxima fatura (perto do vencimento do período atual).',
        })
      }
      return reply.send({ ok: true, invoiceUrl: escolhida.invoiceUrl, status: escolhida.status })
    } catch (e: any) {
      app.log.error(e)
      return reply.status(502).send({ error: e?.message ?? 'Falha ao consultar cobranças no Asaas' })
    }
  })

  // ── POST /billing/comprar-pacote ──────────────────────────────────────────
  // Cobrança avulsa de um pacote. O crédito só é aplicado quando o pagamento
  // é confirmado (webhook) — evita liberar recurso sem pagamento.
  app.post('/billing/comprar-pacote', async (req, reply) => {
    const { empresaId, pacoteId, billingType } = req.body as { empresaId?: string; pacoteId?: string; billingType?: BillingType }
    if (!empresaId || !pacoteId) return reply.status(400).send({ error: 'empresaId e pacoteId são obrigatórios' })
    const tipoCobranca: BillingType = BILLING_TYPES.includes(billingType as BillingType) ? billingType! : 'UNDEFINED'

    const supabase = sb()
    const auth = await autorizarAdminEmpresa(supabase, req.headers.authorization, empresaId)
    if (!auth) return reply.status(403).send({ error: 'Não autorizado' })

    const { data: pacote } = await supabase.from('pacotes_adicionais')
      .select('id, nome, tipo, quantidade, valor, ativo').eq('id', pacoteId).maybeSingle()
    if (!pacote || !pacote.ativo) return reply.status(404).send({ error: 'Pacote não encontrado ou inativo' })

    try {
      const customer = await garantirClienteAsaas(supabase, empresaId)
      const cobranca = await asaasCriarCobranca({
        customer,
        billingType: tipoCobranca,
        value: Number(pacote.valor),
        dueDate: hojeMais(3),
        description: `CheckFlow — pacote ${pacote.nome}`,
        externalReference: empresaId,
      })

      await supabase.from('empresa_cobrancas').insert({
        empresa_id: empresaId,
        tipo: 'pacote',
        asaas_payment_id: cobranca.id,
        pacote_id: pacote.id,
        descricao: `Pacote ${pacote.nome}`,
        valor: pacote.valor,
        billing_type: cobranca.billingType,
        status: cobranca.status,
        vencimento: cobranca.dueDate,
        invoice_url: cobranca.invoiceUrl,
        meta: { tipo_recurso: pacote.tipo, quantidade: pacote.quantidade, creditado: false },
      })

      return reply.send({ ok: true, paymentId: cobranca.id, invoiceUrl: cobranca.invoiceUrl })
    } catch (e: any) {
      app.log.error(e)
      return reply.status(502).send({ error: e?.message ?? 'Falha ao gerar cobrança no Asaas' })
    }
  })

  // ── POST /billing/webhook/asaas ───────────────────────────────────────────
  // Recebe eventos do Asaas. Valida o token (header asaas-access-token) e
  // garante idempotência (entrega "at least once") pelo id do evento.
  app.post('/billing/webhook/asaas', async (req, reply) => {
    const tokenEsperado = process.env.ASAAS_WEBHOOK_TOKEN
    if (!tokenEsperado || req.headers['asaas-access-token'] !== tokenEsperado) {
      return reply.status(401).send({ error: 'Não autorizado' })
    }

    const body = req.body as any
    const eventId: string | undefined = body?.id
    const evento: string | undefined = body?.event
    const pagamento = body?.payment
    if (!eventId || !evento) return reply.status(400).send({ error: 'Payload inválido' })

    const supabase = sb()

    // Idempotência: registra o evento; se já existe, ignora
    const { error: dupErr } = await supabase.from('asaas_webhook_eventos')
      .insert({ event_id: eventId, evento, payload: body })
    if (dupErr) {
      // violação de PK = evento já processado
      return reply.send({ ok: true, duplicado: true })
    }

    if (!pagamento) return reply.send({ ok: true })

    const empresaId: string | null = pagamento.externalReference ?? null
    const ehAssinatura = !!pagamento.subscription

    try {
      // Espelha/atualiza a cobrança local
      const patch: Record<string, any> = {
        status: pagamento.status,
        billing_type: pagamento.billingType,
        valor: pagamento.value,
        vencimento: pagamento.dueDate,
        invoice_url: pagamento.invoiceUrl,
        atualizado_em: new Date().toISOString(),
      }
      if (['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(pagamento.status)) {
        patch.pago_em = new Date().toISOString()
      }

      // Tenta atualizar uma cobrança existente; se não houver (ex: cobrança de
      // assinatura criada pelo Asaas), cria o registro.
      const { data: existente } = await supabase.from('empresa_cobrancas')
        .select('id, tipo, pacote_id, meta').eq('asaas_payment_id', pagamento.id).maybeSingle()

      if (existente) {
        await supabase.from('empresa_cobrancas').update(patch).eq('id', existente.id)
      } else if (empresaId) {
        await supabase.from('empresa_cobrancas').insert({
          empresa_id: empresaId,
          tipo: ehAssinatura ? 'assinatura' : 'pacote',
          asaas_payment_id: pagamento.id,
          asaas_subscription_id: pagamento.subscription ?? null,
          descricao: pagamento.description ?? null,
          ...patch,
        })
      }

      const pago = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(pagamento.status)

      // Crédito de pacote: só quando confirmado e ainda não creditado
      if (pago && existente?.tipo === 'pacote' && existente?.meta && !existente.meta.creditado && empresaId) {
        const recurso = existente.meta.tipo_recurso as string
        const qtd = Number(existente.meta.quantidade ?? 0)
        if (recurso === 'execucoes') {
          await supabase.rpc('billing_creditar_execucoes', { p_empresa_id: empresaId, p_qtd: qtd })
        } else if (recurso === 'tokens_ia') {
          await supabase.rpc('billing_creditar_tokens', { p_empresa_id: empresaId, p_qtd: qtd })
        } else if (recurso === 'armazenamento') {
          await supabase.from('empresa_pacotes_comprados').insert({
            empresa_id: empresaId, pacote_id: existente.pacote_id, tipo: 'armazenamento', quantidade: qtd, valor: pagamento.value,
          })
        }
        await supabase.from('empresa_cobrancas')
          .update({ meta: { ...existente.meta, creditado: true } }).eq('id', existente.id)
      }

      // Estado da assinatura conforme o pagamento
      if (empresaId) {
        if (evento === 'PAYMENT_OVERDUE') {
          // Marca inadimplente e ancora a carência no MENOR vencimento em aberto
          // (a fase vira 'carencia'/somente-leitura em vencido_em + 7 dias).
          const dueDate: string | null = pagamento.dueDate ?? null
          const { data: aAtual } = await supabase.from('empresa_assinaturas')
            .select('vencido_em').eq('empresa_id', empresaId).maybeSingle()
          const venc = vencimentoAncora((aAtual as any)?.vencido_em, dueDate)
          await supabase.from('empresa_assinaturas').update({ status: 'inadimplente', vencido_em: venc, atualizado_em: new Date().toISOString() }).eq('empresa_id', empresaId)
          const corteEm = venc
            ? new Date(dataCorteCarencia(venc) + 'T00:00:00').toLocaleDateString('pt-BR')
            : null

          // Alerta de gestão (Fase 2): avisa o admin da empresa que a fatura
          // venceu, com link para pagar. Idempotente pelo dedup de event_id do
          // webhook (cada evento é processado 1×). Best-effort — falha de canal
          // não trava o retorno 200 ao Asaas.
          try {
            const { data: emp } = await supabase.from('empresas').select('nome').eq('id', empresaId).maybeSingle()
            const nomeEmpresa = (emp as any)?.nome ?? 'sua empresa'
            const admins = await buscarAdminsEmpresa(supabase, empresaId)
            const baseUrl = process.env.APP_URL ?? 'https://app.checkflow.digital'
            const link = `${baseUrl}/gestao/plano`
            const invoiceUrl: string | null = pagamento.invoiceUrl ?? null
            const valor: number | null = pagamento.value ?? null
            const vencimento: string | null = pagamento.dueDate ?? null
            const valorFmt = valor != null ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'sua fatura'
            await notificarAdmins(
              admins,
              () => `🚫 *CheckFlow — fatura em atraso*\n\nA fatura da *${nomeEmpresa}* (${valorFmt}${vencimento ? `, venc. ${vencimento}` : ''}) consta como *não paga*.${corteEm ? ` Se não for paga até *${corteEm}*, o sistema fica em modo *somente-leitura* até a regularização.` : ' Regularize para manter a assinatura ativa.'}\n\n🔗 ${invoiceUrl || link}`,
              (adm) => emailFaturaVencida({ nomeDestinatario: adm.nome, nomeEmpresa, valor, vencimento, invoiceUrl, link }),
              enviarWhatsApp, enviarEmail,
            )
          } catch (notifErr: any) {
            app.log.error(`[billing] falha ao notificar fatura vencida (empresa ${empresaId}): ${notifErr?.message}`)
          }
        } else if (pago && ehAssinatura) {
          // Pagamento de assinatura confirmado. Se há um plano PENDENTE de 1º
          // pagamento, é agora que ele é aplicado (snapshot + status ativo).
          const { data: assin } = await supabase.from('empresa_assinaturas')
            .select('pendente_plano_id').eq('empresa_id', empresaId).maybeSingle()

          if ((assin as any)?.pendente_plano_id) {
            const { data: plano } = await supabase.from('planos')
              .select('id, nome, tipo, valor, ciclo, limite_execucoes_mes, limite_armazenamento_bytes, limite_tokens_ia_mes')
              .eq('id', (assin as any).pendente_plano_id).maybeSingle()
            if (plano) {
              const p = plano as any
              const hoje = new Date(); const fim = new Date(hoje); fim.setMonth(fim.getMonth() + 1)
              await supabase.from('empresa_assinaturas').update({
                plano_id: p.id, plano_nome: p.nome, plano_tipo: p.tipo,
                valor: p.valor, ciclo: p.ciclo,
                limite_execucoes_mes: p.limite_execucoes_mes,
                limite_armazenamento_bytes: p.limite_armazenamento_bytes,
                limite_tokens_ia_mes: p.limite_tokens_ia_mes,
                status: 'ativo',
                periodo_inicio: hoje.toISOString().slice(0, 10),
                periodo_fim: fim.toISOString().slice(0, 10),
                execucoes_usadas: 0, tokens_ia_usados: 0, execucoes_extra: 0, tokens_ia_extra: 0,
                trial_fim: null, ja_usou_trial: true,
                pendente_plano_id: null, vencido_em: null,
                atualizado_em: new Date().toISOString(),
              }).eq('empresa_id', empresaId)
            }
          } else {
            // Pagamento recorrente → garante ativo (recupera de 'inadimplente')
            // e limpa a âncora de carência por inadimplência.
            await supabase.from('empresa_assinaturas').update({ status: 'ativo', vencido_em: null, atualizado_em: new Date().toISOString() }).eq('empresa_id', empresaId)
          }
        }
      }

      return reply.send({ ok: true })
    } catch (e: any) {
      app.log.error(e)
      // Retorna 200 mesmo em erro de processamento para não travar a fila do Asaas;
      // o evento fica registrado e pode ser reprocessado manualmente.
      return reply.send({ ok: false, erro: e?.message })
    }
  })
}
