import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { enviarWhatsApp } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { emailLimiteUso } from '../lib/email-templates'
import {
  avisosPendentes, fraseLimite, orientacaoRecurso, rotuloRecurso,
  type RecursoUso, type FaixaAviso, type UsoRecurso,
} from '../lib/avisosUso'

// Alerta o admin da empresa (WhatsApp + e-mail) quando um limite do plano chega
// a 80% (heads-up) ou 100% (atingido). Recursos: execuções/mês, tokens de IA/mês
// e armazenamento. Disparado por cron diário (cron-job.org → x-cron-secret).
// Idempotente por período de cobrança via tabela `empresa_avisos_uso`.
// Mensagens hardcoded (aviso de plataforma, sempre ligado).

const PERFIL_ADMIN_EMPRESA = '00000000-0000-0000-0000-000000000002'

function formatarNumero(tel: string): string {
  const n = tel.replace(/\D/g, '').replace(/^0/, '')
  return n.startsWith('55') ? n : `55${n}`
}

function mensagemWa(nomeEmpresa: string, recurso: RecursoUso, faixa: FaixaAviso, pct: number, link: string): string {
  const cabecalho = faixa === '100'
    ? `🚫 *CheckFlow — limite de ${rotuloRecurso(recurso)} atingido*`
    : `⚠️ *CheckFlow — ${rotuloRecurso(recurso)} em ${pct}%*`
  return `${cabecalho}\n\n`
    + `Na *${nomeEmpresa}*, ${fraseLimite(recurso, faixa, pct)}\n\n`
    + `${orientacaoRecurso(recurso)}\n\n🔗 ${link}`
}

export async function avisosUsoRoutes(app: FastifyInstance) {
  const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
    { realtime: { transport: ws as any } })

  // POST /cron/billing/avisos-uso — protegido por x-cron-secret (CRON_SECRET)
  // body opcional: { empresa_id?: string } para teste manual de uma empresa.
  app.post('/cron/billing/avisos-uso', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) return reply.status(401).send({ error: 'Não autorizado' })

    const { empresa_id } = (req.body ?? {}) as { empresa_id?: string }
    const baseUrl = process.env.APP_URL ?? 'https://app.checkflow.digital'
    const link = `${baseUrl}/gestao/plano`
    const supabase = sb()

    // Empresas com assinatura (service role: leitura direta, sem o gate de
    // admin do billing_status). Só as que têm ALGUM limite definido importam.
    let q = supabase.from('empresa_assinaturas')
      .select('empresa_id, periodo_inicio, limite_execucoes_mes, execucoes_usadas, execucoes_extra, limite_tokens_ia_mes, tokens_ia_usados, tokens_ia_extra, limite_armazenamento_bytes')
    if (empresa_id) q = q.eq('empresa_id', empresa_id)
    const { data: assinaturas } = await q

    const resultados: { empresaId: string; enviados: string[]; status: string }[] = []

    for (const a of (assinaturas ?? []) as any[]) {
      // Garante período corrente (reseta contadores expirados) antes de medir.
      await supabase.rpc('avancar_periodo_assinatura', { p_empresa_id: a.empresa_id })
      const { data: at } = await supabase.from('empresa_assinaturas')
        .select('periodo_inicio, limite_execucoes_mes, execucoes_usadas, execucoes_extra, limite_tokens_ia_mes, tokens_ia_usados, tokens_ia_extra, limite_armazenamento_bytes')
        .eq('empresa_id', a.empresa_id).maybeSingle()
      if (!at) continue

      // Uso de armazenamento (mesma conta do billing_status).
      const [{ data: usoRows }, { data: pacRows }] = await Promise.all([
        supabase.from('uso_armazenamento').select('tamanho_bytes').eq('empresa_id', a.empresa_id),
        supabase.from('empresa_pacotes_comprados').select('quantidade').eq('empresa_id', a.empresa_id).eq('tipo', 'armazenamento'),
      ])
      const storageUsado = (usoRows ?? []).reduce((s: number, r: any) => s + Number(r.tamanho_bytes ?? 0), 0)
      const storageExtra = (pacRows ?? []).reduce((s: number, r: any) => s + Number(r.quantidade ?? 0), 0)

      const usos: Record<RecursoUso, UsoRecurso> = {
        execucoes:     { usado: Number(at.execucoes_usadas ?? 0), limite: at.limite_execucoes_mes,       extra: Number(at.execucoes_extra ?? 0) },
        tokens_ia:     { usado: Number(at.tokens_ia_usados ?? 0), limite: at.limite_tokens_ia_mes,       extra: Number(at.tokens_ia_extra ?? 0) },
        armazenamento: { usado: storageUsado,                     limite: at.limite_armazenamento_bytes, extra: storageExtra },
      }

      const periodoRef: string = at.periodo_inicio

      // Idempotência: o que já foi avisado neste período.
      const { data: jaRows } = await supabase.from('empresa_avisos_uso')
        .select('recurso, faixa').eq('empresa_id', a.empresa_id).eq('periodo_ref', periodoRef)
      const jaSet = new Set((jaRows ?? []).map((r: any) => `${r.recurso}:${r.faixa}`))

      const pendentes = avisosPendentes(usos, (rec, faixa) => jaSet.has(`${rec}:${faixa}`))
      if (!pendentes.length) { resultados.push({ empresaId: a.empresa_id, enviados: [], status: 'nada_a_avisar' }); continue }

      const { data: empresa } = await supabase.from('empresas').select('nome').eq('id', a.empresa_id).maybeSingle()
      const nomeEmpresa = (empresa as any)?.nome ?? 'sua empresa'

      const { data: vinc } = await supabase.from('usuario_empresa')
        .select('usuarios(nome, email, telefone)')
        .eq('empresa_id', a.empresa_id).eq('perfil_id', PERFIL_ADMIN_EMPRESA)
      const admins = (vinc ?? []).map((v: any) => v.usuarios).filter(Boolean)

      const enviados: string[] = []
      for (const p of pendentes) {
        let algumEnviado = false
        let tinhaContato = false
        for (const adm of admins) {
          if (adm.telefone) {
            tinhaContato = true
            const { ok } = await enviarWhatsApp({ numero: formatarNumero(adm.telefone), mensagem: mensagemWa(nomeEmpresa, p.recurso, p.faixa, p.pct, link) })
            if (ok) algumEnviado = true
          }
          if (adm.email && !adm.email.endsWith('@checkflow.local')) {
            tinhaContato = true
            const { assunto, html } = emailLimiteUso({ nomeDestinatario: adm.nome, nomeEmpresa, recurso: p.recurso, faixa: p.faixa, pct: p.pct, link })
            const { ok } = await enviarEmail({ para: adm.email, assunto, html })
            if (ok) algumEnviado = true
          }
        }
        // Marca a idempotência quando avisou alguém OU quando não havia contato
        // (evita reprocessar todo dia empresa sem admin com telefone/e-mail).
        if (algumEnviado || !tinhaContato) {
          await supabase.from('empresa_avisos_uso')
            .upsert({ empresa_id: a.empresa_id, recurso: p.recurso, faixa: p.faixa, periodo_ref: periodoRef },
                    { onConflict: 'empresa_id,recurso,faixa,periodo_ref', ignoreDuplicates: true })
          enviados.push(`${p.recurso}:${p.faixa}`)
        }
      }

      resultados.push({ empresaId: a.empresa_id, enviados, status: enviados.length ? 'avisado' : 'falha_envio_retry' })
    }

    return reply.send({ ok: true, total: resultados.length, resultados })
  })
}
