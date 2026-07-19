import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { enviarWhatsApp } from '../lib/whatsapp'
import { enviarEmail } from '../lib/email'
import { emailPreCadastrosPendentes } from '../lib/email-templates'
import { buscarAdminsEmpresa, notificarAdmins } from '../lib/adminEmpresa'
import {
  deveLembrarPreCadastros, limiteIdadePreCadastro, mensagemWaPreCadastros,
} from '../lib/avisosGestao'

// Lembretes de gestão ao admin da empresa (Fase 3). Hoje: pré-cadastros
// pendentes há ≥1 dia. Cron diário (cron-job.org → x-cron-secret). Throttle de
// 3 dias por empresa via `empresa_gestao_lembretes` (evita spam diário).

const LEMBRETE_PRE_CADASTROS = 'pre_cadastros_pendentes'

export async function avisosGestaoRoutes(app: FastifyInstance) {
  const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
    { realtime: { transport: ws as any } })

  // POST /cron/gestao/lembretes — protegido por x-cron-secret (CRON_SECRET)
  // body opcional: { empresa_id?: string } para teste manual.
  app.post('/cron/gestao/lembretes', async (req, reply) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return reply.status(500).send({ error: 'CRON_SECRET não configurado' })
    if (req.headers['x-cron-secret'] !== secret) return reply.status(401).send({ error: 'Não autorizado' })

    const { empresa_id } = (req.body ?? {}) as { empresa_id?: string }
    const agora = new Date()
    const baseUrl = process.env.APP_URL ?? 'https://app.checkflow.digital'
    const link = `${baseUrl}/gestao/acessos/usuarios`
    const supabase = sb()

    // Pré-cadastros pendentes há ≥ idade mínima, agrupados por empresa.
    let q = supabase.from('pre_cadastros')
      .select('empresa_id')
      .eq('status', 'pendente')
      .lte('criado_em', limiteIdadePreCadastro(agora))
    if (empresa_id) q = q.eq('empresa_id', empresa_id)
    const { data: pendentes } = await q

    const porEmpresa = new Map<string, number>()
    for (const p of (pendentes ?? []) as any[]) {
      porEmpresa.set(p.empresa_id, (porEmpresa.get(p.empresa_id) ?? 0) + 1)
    }

    const resultados: { empresaId: string; qtd: number; status: string }[] = []

    for (const [empresaId, qtd] of porEmpresa) {
      // Throttle: último lembrete deste tipo para esta empresa.
      const { data: lembrete } = await supabase.from('empresa_gestao_lembretes')
        .select('ultimo_envio_em').eq('empresa_id', empresaId).eq('tipo', LEMBRETE_PRE_CADASTROS).maybeSingle()

      if (!deveLembrarPreCadastros(qtd, (lembrete as any)?.ultimo_envio_em, agora)) {
        resultados.push({ empresaId, qtd, status: 'throttle' })
        continue
      }

      const { data: emp } = await supabase.from('empresas').select('nome').eq('id', empresaId).maybeSingle()
      const nomeEmpresa = (emp as any)?.nome ?? 'sua empresa'
      const admins = await buscarAdminsEmpresa(supabase, empresaId)

      const { algumEnviado, tinhaContato } = await notificarAdmins(
        admins,
        () => mensagemWaPreCadastros(nomeEmpresa, qtd, link),
        (adm) => emailPreCadastrosPendentes({ nomeDestinatario: adm.nome, nomeEmpresa, quantidade: qtd, link }),
        enviarWhatsApp, enviarEmail,
      )

      if (algumEnviado || !tinhaContato) {
        await supabase.from('empresa_gestao_lembretes')
          .upsert({ empresa_id: empresaId, tipo: LEMBRETE_PRE_CADASTROS, ultimo_envio_em: agora.toISOString() },
                  { onConflict: 'empresa_id,tipo' })
        resultados.push({ empresaId, qtd, status: algumEnviado ? 'enviado' : 'sem_contato_marcado' })
      } else {
        resultados.push({ empresaId, qtd, status: 'falha_envio_retry' })
      }
    }

    return reply.send({ ok: true, total: resultados.length, resultados })
  })
}
