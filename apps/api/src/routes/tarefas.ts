import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { exigirAutorizacao } from '../lib/apiAuth'
import { enviarWhatsApp } from '../lib/whatsapp'
import { enviarPush } from '../lib/push'
import { buscarTemplate, renderizar, empresaDeUnidade } from '../lib/notificacao-templates'

// ─── Rota ────────────────────────────────────────────────────────────────────

export async function tarefasRoutes(app: FastifyInstance) {
  /**
   * POST /tarefas/notificar
   *
   * Body: { lista_id }
   *
   * Avisa por WhatsApp cada membro dos grupos/subgrupos atribuídos à lista
   * (respeitando o turno de quem o tiver). Disparado ao publicar uma lista
   * com `notificar_whatsapp = true`. Erros de canal são silenciados.
   */
  app.post('/tarefas/notificar', async (req, reply) => {
    if (!await exigirAutorizacao(req, reply)) return
    const { lista_id } = (req.body ?? {}) as { lista_id?: string }
    if (!lista_id) return reply.status(400).send({ error: 'lista_id é obrigatório' })

    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { realtime: { transport: ws as any } }
    )

    // 1. Lista (precisa estar publicada e querer notificar)
    const { data: lista } = await sb.from('tarefa_listas')
      .select('id, titulo, status, notificar_whatsapp, unidade_id')
      .eq('id', lista_id).single()
    if (!lista) return reply.status(404).send({ error: 'Lista não encontrada' })
    if (lista.status !== 'publicada' || !lista.notificar_whatsapp) {
      return reply.send({ enviados: 0, motivo: 'Lista não publicada ou sem notificação' })
    }

    // Template configurável da empresa (fallback hardcoded se não houver).
    // Se existir e estiver desativado, não dispara.
    const empresaId = await empresaDeUnidade(sb, (lista as any).unidade_id)
    const tmplWa = empresaId ? await buscarTemplate(sb, empresaId, 'tarefa_publicada', 'whatsapp') : null
    if (tmplWa && !tmplWa.ativo) {
      return reply.send({ enviados: 0, motivo: 'Template desativado' })
    }

    // 2. Atribuições
    const [{ data: lg }, { data: ls }] = await Promise.all([
      sb.from('tarefa_lista_grupos').select('grupo_id').eq('lista_id', lista_id),
      sb.from('tarefa_lista_subgrupos').select('subgrupo_id').eq('lista_id', lista_id),
    ])
    const subgrupoIds = (ls ?? []).map((r: any) => r.subgrupo_id)
    const grupoIds = (lg ?? []).map((r: any) => r.grupo_id)

    // 3. Destinatários: se há subgrupos, são os membros deles; senão, os membros dos grupos.
    const destinatarios = new Map<string, { nome: string; telefone: string | null }>()
    if (subgrupoIds.length > 0) {
      const { data } = await sb.from('usuario_subgrupo')
        .select('usuario_id, usuarios(nome, telefone)')
        .in('subgrupo_id', subgrupoIds)
      for (const m of (data ?? [])) {
        const u = (m as any).usuarios ?? {}
        destinatarios.set((m as any).usuario_id, { nome: u.nome ?? '—', telefone: u.telefone ?? null })
      }
    } else if (grupoIds.length > 0) {
      const { data } = await sb.from('usuario_grupo')
        .select('usuario_id, usuarios(nome, telefone)')
        .in('grupo_id', grupoIds)
      for (const m of (data ?? [])) {
        const u = (m as any).usuarios ?? {}
        destinatarios.set((m as any).usuario_id, { nome: u.nome ?? '—', telefone: u.telefone ?? null })
      }
    }

    if (destinatarios.size === 0) {
      return reply.send({ enviados: 0, motivo: 'Nenhum destinatário' })
    }

    // 4. Turno: só suprime envio para quem tem turno modo 'notificacao' e está fora agora
    const ids = Array.from(destinatarios.keys())
    const foraDoTurno = new Set<string>()
    await Promise.all(ids.map(async (uid) => {
      const { data: recebe } = await sb.rpc('usuario_recebe_notificacao', { p_usuario_id: uid })
      if (recebe === false) foraDoTurno.add(uid)
    }))

    const baseUrl = process.env.APP_URL ?? 'https://app.checkflow.digital'
    const link = `${baseUrl}/operacao`

    // 5. Envia
    let enviados = 0
    const erros: string[] = []
    await Promise.all(ids.map(async (uid) => {
      if (foraDoTurno.has(uid)) return
      const { nome, telefone } = destinatarios.get(uid)!
      if (!telefone) return
      const numero = telefone.replace(/\D/g, '').replace(/^0/, '')
      const numeroFinal = numero.startsWith('55') ? numero : `55${numero}`
      const mensagem = tmplWa
        ? renderizar(tmplWa.corpo, { destinatario: nome, titulo: lista.titulo, link })
        : `📋 *Nova lista de tarefas*\n\n` +
          `Olá, ${nome}! Você tem uma nova lista para responder: *${lista.titulo}*.\n\n` +
          `Abra o app na aba *Tarefas* para responder.\n🔗 ${link}`
      const { ok, erro } = await enviarWhatsApp({ numero: numeroFinal, mensagem })
      if (ok) enviados++
      else erros.push(`${nome}: ${erro}`)
    }))

    // 6. Push (PWA) — independe de telefone; mesmo público (respeita turno)
    const idsPush = ids.filter(uid => !foraDoTurno.has(uid))
    const push_enviados = (await enviarPush(sb, idsPush, {
      titulo: 'Nova lista de tarefas',
      corpo: lista.titulo,
      url: `${baseUrl}/operacao?aba=tarefas`,
      tag: 'tarefa-nova',
    })).enviados

    return reply.send({ enviados, push_enviados, erros })
  })
}
