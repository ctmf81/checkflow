import { FastifyInstance } from 'fastify'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import {
  asaasCriarCliente, asaasCriarAssinatura, asaasCriarCobranca, asaasCancelarAssinatura,
  type BillingType, type Cycle,
} from '../lib/asaas'

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
    if (user.user_metadata?.role === 'admin_sistema') return { userId: user.id }
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

    try {
      const customer = await garantirClienteAsaas(supabase, empresaId)

      // cancela assinatura anterior, se houver
      const { data: assinAtual } = await supabase.from('empresa_assinaturas')
        .select('asaas_subscription_id, ja_usou_trial').eq('empresa_id', empresaId).maybeSingle()
      if (assinAtual?.asaas_subscription_id) {
        try { await asaasCancelarAssinatura(assinAtual.asaas_subscription_id) } catch { /* ignora */ }
      }

      const cycle: Cycle = plano.ciclo === 'anual' ? 'YEARLY' : 'MONTHLY'
      const assinatura = await asaasCriarAssinatura({
        customer,
        billingType: tipoCobranca,
        value: Number(plano.valor),
        nextDueDate: hojeMais(1),
        cycle,
        description: `CheckFlow — plano ${plano.nome}`,
        externalReference: empresaId,
      })

      // Snapshot dos termos + vínculo da assinatura Asaas
      const hoje = new Date()
      const periodoFim = new Date(hoje); periodoFim.setMonth(periodoFim.getMonth() + 1)
      await supabase.from('empresa_assinaturas').upsert({
        empresa_id: empresaId,
        plano_id: plano.id,
        plano_nome: plano.nome,
        plano_tipo: plano.tipo,
        valor: plano.valor,
        ciclo: plano.ciclo,
        limite_execucoes_mes: plano.limite_execucoes_mes,
        limite_armazenamento_bytes: plano.limite_armazenamento_bytes,
        limite_tokens_ia_mes: plano.limite_tokens_ia_mes,
        status: 'ativo',
        periodo_inicio: hoje.toISOString().slice(0, 10),
        periodo_fim: periodoFim.toISOString().slice(0, 10),
        execucoes_usadas: 0, tokens_ia_usados: 0, execucoes_extra: 0, tokens_ia_extra: 0,
        trial_fim: null,
        ja_usou_trial: assinAtual?.ja_usou_trial ?? false,
        proximo_plano_id: null, troca_efetiva_em: null,
        asaas_customer_id: customer,
        asaas_subscription_id: assinatura.id,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id' })

      return reply.send({ ok: true, subscriptionId: assinatura.id })
    } catch (e: any) {
      app.log.error(e)
      return reply.status(502).send({ error: e?.message ?? 'Falha ao criar assinatura no Asaas' })
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
          await supabase.from('empresa_assinaturas').update({ status: 'inadimplente', atualizado_em: new Date().toISOString() }).eq('empresa_id', empresaId)
        } else if (pago && ehAssinatura) {
          await supabase.from('empresa_assinaturas').update({ status: 'ativo', atualizado_em: new Date().toISOString() }).eq('empresa_id', empresaId)
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
