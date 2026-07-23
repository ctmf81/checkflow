import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { enviarEmail } from '../lib/email'
import { emailParceiroBoasVindas, emailParceiroResumoMensal } from '../lib/email-templates'
import { asaasCriarSubconta } from '../lib/asaas'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function referenciaMes(d: Date): { chave: string; label: string } {
  const ano = d.getUTCFullYear()
  const mes = d.getUTCMonth() // 0-11
  return {
    chave: `${ano}-${String(mes + 1).padStart(2, '0')}`,
    label: `${MESES[mes]}/${ano}`,
  }
}

// Regra de negócio: o resumo é enviado no ÚLTIMO dia do mês. O scheduler pode
// chamar a rota diariamente — a própria rota decide se hoje é o dia certo.
function ehUltimoDiaDoMes(d: Date): boolean {
  const amanha = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  return amanha.getUTCMonth() !== d.getUTCMonth()
}

const PLANO_LABELS: Record<string, string> = {
  validacao: 'Validação',
  tracao: 'Tração',
  escala: 'Escala',
}

export async function parceiroRoutes(app: FastifyInstance) {
  // Node 20 não tem WebSocket nativo — `ws` evita crash do RealtimeClient
  const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
    { realtime: { transport: ws as any } })

  // POST /parceiros/boas-vindas — dispara o email de boas-vindas (1x por parceiro)
  app.post('/parceiros/boas-vindas', async (req, reply) => {
    const { parceiroId, empresaId } = req.body as { parceiroId?: string; empresaId?: string }
    if (!parceiroId) return reply.status(400).send({ error: 'parceiroId é obrigatório' })

    const supabase = sb()

    const { data: parceiro } = await supabase
      .from('parceiros')
      .select('id, nome, email, email_boasvindas_enviado_em')
      .eq('id', parceiroId)
      .maybeSingle()

    if (!parceiro) return reply.status(404).send({ error: 'Parceiro não encontrado' })
    if (parceiro.email_boasvindas_enviado_em) {
      return reply.send({ ok: true, jaEnviado: true })
    }

    let nomeEmpresa = ''
    let percentual: number | null = null
    if (empresaId) {
      const { data: empresa } = await supabase
        .from('empresas')
        .select('nome')
        .eq('id', empresaId)
        .maybeSingle()
      nomeEmpresa = empresa?.nome ?? ''
      const { data: fin } = await supabase
        .from('empresa_financeiro')
        .select('parceiro_percentual')
        .eq('empresa_id', empresaId)
        .maybeSingle()
      percentual = fin?.parceiro_percentual ?? null
    }

    const { assunto, html } = emailParceiroBoasVindas({
      nomeParceiro: parceiro.nome,
      nomeEmpresa,
      percentual,
    })

    const { ok, erro } = await enviarEmail({ para: parceiro.email, assunto, html })
    if (!ok) return reply.status(502).send({ error: `Falha ao enviar email: ${erro}` })

    const agora = new Date().toISOString()
    await supabase.from('parceiros').update({ email_boasvindas_enviado_em: agora }).eq('id', parceiro.id)
    await supabase.from('parceiro_emails_log').upsert(
      { parceiro_id: parceiro.id, tipo: 'boas_vindas', referencia: null, enviado_em: agora },
      { onConflict: 'parceiro_id,tipo,referencia' }
    )

    return reply.send({ ok: true })
  })

  // POST /parceiros/:id/conta-asaas — cria a SUBCONTA Asaas do parceiro (split).
  // Reusa os dados do cadastro (nome/e-mail/documento/telefone) e grava o
  // walletId retornado. Idempotente: se já existe wallet, devolve sem recriar.
  // Restrito a admin de sistema (cria conta financeira real). Campos que o Asaas
  // exige e o cadastro não tem (endereço, incomeValue, birthDate) fazem o Asaas
  // retornar erro descritivo — repassado pro front pra o admin saber o que falta.
  app.post('/parceiros/:id/conta-asaas', async (req, reply) => {
    const { id } = req.params as { id: string }
    const supabase = sb()

    const token = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return reply.status(401).send({ error: 'Não autorizado' })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user?.app_metadata?.role !== 'admin_sistema') {
      return reply.status(403).send({ error: 'Apenas admin de sistema pode criar a conta do parceiro.' })
    }

    const { data: p } = await supabase.from('parceiros')
      .select('id, nome, email, telefone, documento, asaas_wallet_id, data_nascimento, tipo_empresa, renda_mensal, cep, endereco, endereco_numero, complemento, bairro')
      .eq('id', id).maybeSingle()
    if (!p) return reply.status(404).send({ error: 'Parceiro não encontrado' })
    const pp = p as any
    if (pp.asaas_wallet_id) {
      return reply.send({ ok: true, jaExiste: true, walletId: pp.asaas_wallet_id })
    }

    const doc = String(pp.documento ?? '').replace(/\D/g, '')
    if (!doc) return reply.status(400).send({ error: 'Parceiro sem CPF/CNPJ — preencha o documento antes de criar a conta.' })
    const fone = pp.telefone ? String(pp.telefone).replace(/\D/g, '') : undefined
    const ehPj = doc.length === 14

    try {
      const conta = await asaasCriarSubconta({
        name: pp.nome,
        email: pp.email,
        cpfCnpj: doc,
        mobilePhone: fone,
        ...(pp.renda_mensal != null ? { incomeValue: Number(pp.renda_mensal) } : {}),
        ...(pp.cep ? { postalCode: String(pp.cep).replace(/\D/g, '') } : {}),
        ...(pp.endereco ? { address: pp.endereco } : {}),
        ...(pp.endereco_numero ? { addressNumber: String(pp.endereco_numero) } : {}),
        ...(pp.complemento ? { complement: pp.complemento } : {}),
        ...(pp.bairro ? { province: pp.bairro } : {}),
        // PJ → companyType (default LIMITED, editável na subconta); PF → birthDate.
        ...(ehPj ? { companyType: pp.tipo_empresa || 'LIMITED' } : {}),
        ...(!ehPj && pp.data_nascimento ? { birthDate: String(pp.data_nascimento) } : {}),
      })
      await supabase.from('parceiros')
        .update({ asaas_wallet_id: conta.walletId, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      return reply.send({ ok: true, walletId: conta.walletId })
    } catch (e: any) {
      app.log.error(e)
      return reply.status(502).send({ error: e?.message ?? 'Falha ao criar a subconta no Asaas' })
    }
  })

  // POST /cron/parceiros/resumo-mensal — disparo agendado (último dia do mês)
  // Protegido por header `x-cron-secret` (env CRON_SECRET).
  app.post('/cron/parceiros/resumo-mensal', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) {
      return reply.status(401).send({ error: 'Não autorizado' })
    }

    const agora = new Date()
    const { chave: refMes, label: refLabel } = referenciaMes(agora)

    // `force: true` no body permite testar manualmente fora do último dia
    const { force } = (req.body ?? {}) as { force?: boolean }
    if (!ehUltimoDiaDoMes(agora) && !force) {
      return reply.send({ ok: true, skip: 'nao_e_ultimo_dia_do_mes', referencia: refMes })
    }

    const supabase = sb()

    // Início do mês corrente — usado para detectar empresas que ficaram inativas no período
    const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString()

    const { data: parceiros } = await supabase
      .from('parceiros')
      .select('id, nome, email, status')
      .eq('status', 'ativo')

    const resultados: { parceiroId: string; status: string }[] = []

    for (const parceiro of parceiros ?? []) {
      // Já enviado este mês? (idempotência)
      const { data: jaEnviado } = await supabase
        .from('parceiro_emails_log')
        .select('id')
        .eq('parceiro_id', parceiro.id)
        .eq('tipo', 'resumo_mensal')
        .eq('referencia', refMes)
        .maybeSingle()

      if (jaEnviado) {
        resultados.push({ parceiroId: parceiro.id, status: 'ja_enviado' })
        continue
      }

      // Dados financeiros do parceiro (admin-only) + nome/status da empresa via join
      const { data: fins } = await supabase
        .from('empresa_financeiro')
        .select('status_pagamento, plano, valor_mensalidade, parceiro_percentual, empresa:empresa_id(id, nome, status)')
        .eq('parceiro_id', parceiro.id)

      if (!fins || fins.length === 0) {
        resultados.push({ parceiroId: parceiro.id, status: 'sem_empresas' })
        continue
      }

      const empresas = fins.map((f: any) => {
        const emp = Array.isArray(f.empresa) ? f.empresa[0] : f.empresa
        return {
          id: emp?.id, nome: emp?.nome ?? '—', status: emp?.status,
          status_pagamento: f.status_pagamento, plano: f.plano,
          valor_mensalidade: f.valor_mensalidade, parceiro_percentual: f.parceiro_percentual,
        }
      }).filter(e => e.id)

      const linhas = empresas.map(e => {
        // "Enquanto houver contrato": empresa ativa E pagamento não cancelado.
        // Inadimplente/pendente ainda conta (contrato vigente, cobrança em aberto).
        const comContrato = e.status === 'ativo' && e.status_pagamento !== 'cancelado'
        const comissao = comContrato && e.valor_mensalidade != null && e.parceiro_percentual != null
          ? Number(e.valor_mensalidade) * Number(e.parceiro_percentual) / 100
          : null
        return {
          nome: e.nome,
          plano: e.plano ? (PLANO_LABELS[e.plano] ?? e.plano) : null,
          valorMensalidade: e.valor_mensalidade != null ? Number(e.valor_mensalidade) : null,
          percentual: e.parceiro_percentual != null ? Number(e.parceiro_percentual) : null,
          comissaoEstimada: comissao,
        }
      })

      const totalEstimado = linhas.reduce((acc, l) => acc + (l.comissaoEstimada ?? 0), 0)

      // Empresas desse parceiro que ficaram inativas neste mês
      const empresaIds = empresas.map(e => e.id)
      const { data: eventos } = await supabase
        .from('empresa_status_eventos')
        .select('empresa_id, status_novo, criado_em')
        .in('empresa_id', empresaIds)
        .eq('status_novo', 'inativo')
        .gte('criado_em', inicioMes)

      const idsInativados = new Set((eventos ?? []).map(ev => ev.empresa_id))
      const empresasInativadas = empresas.filter(e => idsInativados.has(e.id)).map(e => e.nome)

      const { assunto, html } = emailParceiroResumoMensal({
        nomeParceiro: parceiro.nome,
        mesReferenciaLabel: refLabel,
        empresas: linhas,
        totalEstimado,
        empresasInativadas,
      })

      const { ok, erro } = await enviarEmail({ para: parceiro.email, assunto, html })
      if (!ok) {
        resultados.push({ parceiroId: parceiro.id, status: `erro: ${erro}` })
        continue
      }

      await supabase.from('parceiro_emails_log').insert({
        parceiro_id: parceiro.id, tipo: 'resumo_mensal', referencia: refMes,
      })
      resultados.push({ parceiroId: parceiro.id, status: 'enviado' })
    }

    return reply.send({ ok: true, referencia: refMes, total: resultados.length, resultados })
  })
}
