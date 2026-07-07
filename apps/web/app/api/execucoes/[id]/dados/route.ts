import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/execucoes/[id]/dados — retorna os dados da execução em JSON para a
// TELA interativa (fotos ampliáveis / vídeos tocáveis), em vez do PDF estático.
// Usa service role (como a rota do PDF) para não esbarrar no RLS ao ler a
// execução de outro operador, mas com checagem de acesso: admin, membro da
// unidade da execução, ou o próprio executor.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: execId } = await params

  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })
  const sbPublic = createClient(SUPABASE_URL, SUPABASE_ANON)
  const { data: { user }, error: authErr } = await sbPublic.auth.getUser(token)
  if (authErr || !user) return Response.json({ error: 'Sessão inválida' }, { status: 401 })

  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET)

  const { data: execucao } = await sb.from('checklist_execucoes')
    .select('id, resultado, data_execucao, checklist_id, unidade_id, executado_por')
    .eq('id', execId).single()
  if (!execucao) return Response.json({ error: 'Execução não encontrada' }, { status: 404 })

  // Autorização
  let autorizado = user.user_metadata?.role === 'admin_sistema' || execucao.executado_por === user.id
  if (!autorizado) {
    const { count } = await sb.from('usuario_unidade')
      .select('usuario_id', { count: 'exact', head: true })
      .eq('usuario_id', user.id).eq('unidade_id', execucao.unidade_id)
    autorizado = (count ?? 0) > 0
  }
  if (!autorizado) return Response.json({ error: 'Sem acesso a esta execução' }, { status: 403 })

  const [
    { data: checklist },
    { data: unidade },
    { data: executor },
    { data: secoes },
    { data: atividades },
    { data: respostasRaw },
    { data: planos },
  ] = await Promise.all([
    sb.from('checklists').select('nome').eq('id', execucao.checklist_id).single(),
    sb.from('unidades').select('nome, empresas(nome)').eq('id', execucao.unidade_id).single(),
    sb.from('usuarios').select('nome').eq('id', execucao.executado_por).single(),
    sb.from('checklist_secoes').select('id, nome, ordem').eq('checklist_id', execucao.checklist_id).order('ordem'),
    sb.from('checklist_atividades').select('id, nome, tipo, secao_id, ordem').eq('checklist_id', execucao.checklist_id).order('ordem'),
    sb.from('checklist_execucao_respostas').select('atividade_id, resposta, conforme').eq('execucao_id', execId),
    sb.from('planos_acao').select('id, identificador, status, checklist_atividades(nome)').eq('checklist_execucao_id', execId),
  ])

  const respostas: Record<string, any> = {}
  for (const r of (respostasRaw ?? [])) respostas[r.atividade_id] = { resposta: r.resposta, conforme: r.conforme }

  return Response.json({
    execucao,
    checklist,
    secoes: secoes ?? [],
    atividades: atividades ?? [],
    respostas,
    planos: planos ?? [],
    empresa: (unidade as any)?.empresas?.nome ?? '',
    unidade: (unidade as any)?.nome ?? '',
    executor: executor?.nome ?? '',
  })
}
