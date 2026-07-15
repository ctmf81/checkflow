import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { enviarWhatsApp } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { emailTrialExpirando } from '../lib/email-templates'

// Avisa o admin da empresa (e-mail + WhatsApp) que o teste está acabando, antes
// de a conta cair em somente-leitura. Idempotente por empresa (colunas
// aviso_trial_5d_em / aviso_trial_1d_em). Disparado por cron diário
// (cron-job.org → x-cron-secret). Mensagens hardcoded (aviso de plataforma).

const PERFIL_ADMIN_EMPRESA = '00000000-0000-0000-0000-000000000002'

function formatarNumero(tel: string): string {
  const n = tel.replace(/\D/g, '').replace(/^0/, '')
  return n.startsWith('55') ? n : `55${n}`
}

function mensagemWa(nomeEmpresa: string, dias: number, link: string): string {
  const quando = dias <= 0 ? 'termina *hoje*' : dias === 1 ? 'termina *amanhã*' : `termina em *${dias} dias*`
  return `⏳ *CheckFlow — seu teste ${quando}*\n\n`
    + `O período de teste da *${nomeEmpresa}* está acabando. Depois disso a conta fica em *somente-leitura*: `
    + `você continua consultando e operando, mas *não cria itens novos* (checklists, tarefas, tickets, agendamentos, workflows ou relatórios) até contratar um plano.\n\n`
    + `Contrate agora para não perder recursos:\n🔗 ${link}`
}

export async function avisosTrialRoutes(app: FastifyInstance) {
  const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
    { realtime: { transport: ws as any } })

  // POST /cron/billing/avisos-trial — protegido por x-cron-secret (CRON_SECRET)
  // body opcional: { force?: boolean, empresa_id?: string } para teste manual
  app.post('/cron/billing/avisos-trial', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) return reply.status(401).send({ error: 'Não autorizado' })

    const { force, empresa_id } = (req.body ?? {}) as { force?: boolean; empresa_id?: string }
    const baseUrl = process.env.APP_URL ?? 'https://app.checkflow.digital'
    const link = `${baseUrl}/gestao/plano`

    const hoje = new Date()
    const hojeStr = hoje.toISOString().slice(0, 10)
    const em5Str = new Date(hoje.getTime() + 5 * 86400000).toISOString().slice(0, 10)

    const supabase = sb()

    // Trials perto do fim (0–5 dias), sem ser plano pago/cortesia
    let q = supabase.from('empresa_assinaturas')
      .select('empresa_id, plano_tipo, trial_fim, aviso_trial_5d_em, aviso_trial_1d_em')
      .not('plano_tipo', 'in', '(pago,cortesia)')
      .not('trial_fim', 'is', null)
      .gte('trial_fim', hojeStr)
      .lte('trial_fim', em5Str)
    if (empresa_id) q = q.eq('empresa_id', empresa_id)
    const { data: assinaturas } = await q

    const resultados: { empresaId: string; status: string }[] = []

    for (const a of (assinaturas ?? []) as any[]) {
      const dias = Math.round((Date.parse(a.trial_fim) - Date.parse(hojeStr)) / 86400000)

      // Qual aviso disparar? 1d (urgente) tem prioridade; senão 5d (heads-up).
      let coluna: 'aviso_trial_1d_em' | 'aviso_trial_5d_em' | null = null
      if (dias <= 1 && (force || !a.aviso_trial_1d_em)) coluna = 'aviso_trial_1d_em'
      else if (dias <= 5 && dias > 1 && (force || !a.aviso_trial_5d_em)) coluna = 'aviso_trial_5d_em'

      if (!coluna) { resultados.push({ empresaId: a.empresa_id, status: 'ja_avisado' }); continue }

      const { data: empresa } = await supabase.from('empresas').select('nome').eq('id', a.empresa_id).maybeSingle()
      const nomeEmpresa = (empresa as any)?.nome ?? 'sua empresa'

      // Admins da empresa (perfil ...002)
      const { data: vinc } = await supabase.from('usuario_empresa')
        .select('usuarios(nome, email, telefone)')
        .eq('empresa_id', a.empresa_id).eq('perfil_id', PERFIL_ADMIN_EMPRESA)
      const admins = (vinc ?? []).map((v: any) => v.usuarios).filter(Boolean)

      if (!admins.length) { resultados.push({ empresaId: a.empresa_id, status: 'sem_admin' }); continue }

      let algumEnviado = false
      let tinhaContato = false
      for (const adm of admins) {
        // WhatsApp
        if (adm.telefone) {
          tinhaContato = true
          const { ok } = await enviarWhatsApp({ numero: formatarNumero(adm.telefone), mensagem: mensagemWa(nomeEmpresa, dias, link) })
          if (ok) algumEnviado = true
        }
        // E-mail (ignora o técnico não-entregável <cpf>@checkflow.local)
        if (adm.email && !adm.email.endsWith('@checkflow.local')) {
          tinhaContato = true
          const { assunto, html } = emailTrialExpirando({ nomeDestinatario: adm.nome, nomeEmpresa, diasRestantes: dias, link })
          const { ok } = await enviarEmail({ para: adm.email, assunto, html })
          if (ok) algumEnviado = true
        }
      }

      // Marca a idempotência se conseguiu avisar alguém, OU se não havia contato
      // (evita retry infinito de empresa sem admin com telefone/e-mail).
      if (algumEnviado || !tinhaContato) {
        await supabase.from('empresa_assinaturas').update({ [coluna]: new Date().toISOString() }).eq('empresa_id', a.empresa_id)
        resultados.push({ empresaId: a.empresa_id, status: algumEnviado ? `enviado_${coluna}` : 'sem_contato_marcado' })
      } else {
        resultados.push({ empresaId: a.empresa_id, status: 'falha_envio_retry' })
      }
    }

    return reply.send({ ok: true, hoje: hojeStr, total: resultados.length, resultados })
  })
}
