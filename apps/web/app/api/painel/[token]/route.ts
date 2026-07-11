import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { montarLinha, montarBarras, montarPadrao, serieConformidade, composicaoDiaria, opcoesSimNao, resumoExecucao, placarChecklist, conformidadePorDiaExec, tempoMedioExecucao, topNaoConformes, resumoPlanos, type OpcaoRaw, type ExecChecklistRaw } from '@/lib/painelDados'

// GET /api/painel/[token] — dados PÚBLICOS de um dashboard (sem login).
// Escopado ao token: só devolve os painéis daquele dashboard e a série de cada
// atividade. Usa service-role (o público não tem sessão) — a barreira é o token
// não-adivinhável. Chamado em polling pela página /painel/[token].

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const MAX_PONTOS = 500

// Cache curto por token (em memória, por instância). Colapsa várias TVs do mesmo
// dashboard num único hit ao banco dentro da janela e protege contra abuso do
// link público. Dado de monitoramento tolera alguns segundos de atraso.
const CACHE_TTL_MS = 15_000
const cache = new Map<string, { expira: number; body: string }>()

// Monta o payload de um painel de CHECKLIST: placar, conformidade por dia, top
// atividades não conformes, tratamento (planos), não execução, tempo médio e
// frescor (última execução). Tudo escopado ao checklist na janela.
async function montarPainelChecklist(sb: any, p: any, agora: number, corte: string) {
  const ck = Array.isArray(p.checklist) ? p.checklist[0] : p.checklist
  const titulo = p.titulo || ck?.nome || 'Checklist'
  const base = {
    id: p.id, titulo, tipo: 'checklist', grafico: 'checklist', janela_horas: p.janela_horas,
    alerta_silencio_horas: p.alerta_silencio_horas ?? null,
  }

  // Execuções do checklist na janela (concluídas + não executadas)
  const { data: execsRaw } = await sb.from('checklist_execucoes')
    .select('id, status, resultado, data_execucao, iniciado_em, motivo:motivo_nao_execucao_id(descricao)')
    .eq('checklist_id', p.checklist_id)
    .gte('data_execucao', corte)
    .in('status', ['concluido', 'nao_executado'])
    .order('data_execucao', { ascending: true })
    .limit(3000)

  const execs: (ExecChecklistRaw & { id: string })[] = (execsRaw ?? []).map((e: any) => {
    const m = Array.isArray(e.motivo) ? e.motivo[0] : e.motivo
    return { id: e.id, status: e.status, resultado: e.resultado ?? null, motivo: m?.descricao ?? null, data_execucao: e.data_execucao, iniciado_em: e.iniciado_em ?? null }
  })

  const concluidas = execs.filter(e => e.status === 'concluido')
  const ultimoEm = execs.length ? execs[execs.length - 1].data_execucao : null
  const resumo = resumoExecucao(execs.map(e => ({ status: e.status, motivo: e.motivo })))

  // Top atividades não conformes — respostas das execuções concluídas (conforme já gravado)
  const execIds = concluidas.map(e => e.id).slice(0, 500)
  let top: ReturnType<typeof topNaoConformes> = []
  if (execIds.length) {
    const { data: resp } = await sb.from('checklist_execucao_respostas')
      .select('atividade_id, conforme, checklist_atividades(nome)')
      .in('execucao_id', execIds)
      .not('conforme', 'is', null)
    top = topNaoConformes((resp ?? []).map((r: any) => {
      const a = Array.isArray(r.checklist_atividades) ? r.checklist_atividades[0] : r.checklist_atividades
      return { atividade_id: r.atividade_id, nome: a?.nome ?? '—', conforme: r.conforme }
    }))
  }

  // Tratamento — planos de ação das execuções concluídas na janela
  let tratamento = { corrigidos: 0, naoCorrigidos: 0, aguardN1: 0, aguardN2: 0 }
  if (execIds.length) {
    const { data: planos } = await sb.from('planos_acao')
      .select('status').in('checklist_execucao_id', execIds).limit(3000)
    tratamento = resumoPlanos((planos ?? []).map((x: any) => x.status))
  }

  return {
    ...base,
    ultimo_em: ultimoEm,
    placar: placarChecklist(execs),
    conformidade_dias: conformidadePorDiaExec(execs),
    top_nao_conformes: top,
    tratamento,
    tempo_medio: tempoMedioExecucao(execs),
    motivos: resumo.porMotivo,
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || !SUPABASE_SECRET) return Response.json({ error: 'Indisponível' }, { status: 500 })

  // Cache-hit: devolve o corpo já calculado se ainda fresco
  const agoraCache = Date.now()
  const hit = cache.get(token)
  if (hit && hit.expira > agoraCache) {
    return new Response(hit.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Cache': 'HIT' } })
  }
  // Poda entradas expiradas (poucos dashboards; barato)
  if (cache.size > 200) for (const [k, v] of cache) if (v.expira <= agoraCache) cache.delete(k)

  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET)

  const { data: dash } = await sb.from('dashboards')
    .select('id, nome, transicao_segundos, refresh_segundos')
    .eq('token', token).single()
  if (!dash) return Response.json({ error: 'Dashboard não encontrado' }, { status: 404 })

  const { data: paineisRaw } = await sb.from('dashboard_paineis')
    .select('id, ordem, titulo, tipo, atividade_id, checklist_id, janela_horas, alerta_silencio_horas, atividade:atividade_id(nome, tipo, config, checklist_id), checklist:checklist_id(nome)')
    .eq('dashboard_id', dash.id).order('ordem')

  const agora = Date.now()
  const paineis = await Promise.all((paineisRaw ?? []).map(async (p: any) => {
    const janelaMs = p.janela_horas * 3600_000
    const corte = new Date(agora - janelaMs).toISOString()

    // ── Painel de CHECKLIST (monitora o checklist inteiro) ──
    if (p.tipo === 'checklist') {
      return montarPainelChecklist(sb, p, agora, corte)
    }

    const atv = Array.isArray(p.atividade) ? p.atividade[0] : p.atividade
    const tipo: string = atv?.tipo ?? 'texto'
    const cfg = atv?.config ?? {}
    const titulo = p.titulo || atv?.nome || 'Painel'

    const { data: respostas } = await sb.from('checklist_execucao_respostas')
      .select('resposta, criado_em')
      .eq('atividade_id', p.atividade_id)
      .gte('criado_em', corte)
      .order('criado_em', { ascending: true })
      .limit(MAX_PONTOS)

    const rs = (respostas ?? []) as { resposta: any; criado_em: string }[]

    // ── Frescor + não execução (nível checklist) ──
    // Última leitura desta atividade (para o selo de silêncio) e resumo das
    // execuções do checklist na janela (concluídas × não executadas + motivos).
    const ultimoEm = rs.length ? rs[rs.length - 1].criado_em : null
    const checklistId = atv?.checklist_id ?? null
    let resumo = { concluidas: 0, naoExecutadas: 0, porMotivo: [] as { motivo: string; count: number }[] }
    if (checklistId) {
      const { data: execs } = await sb.from('checklist_execucoes')
        .select('status, motivo:motivo_nao_execucao_id(descricao)')
        .eq('checklist_id', checklistId)
        .gte('data_execucao', corte)
        .in('status', ['concluido', 'nao_executado'])
        .limit(2000)
      resumo = resumoExecucao((execs ?? []).map((e: any) => {
        const m = Array.isArray(e.motivo) ? e.motivo[0] : e.motivo
        return { status: e.status, motivo: m?.descricao ?? null }
      }))
    }

    const base = {
      id: p.id, titulo, tipo, janela_horas: p.janela_horas,
      alerta_silencio_horas: p.alerta_silencio_horas ?? null,
      ultimo_em: ultimoEm,
      execucoes: resumo.concluidas,
      nao_executadas: resumo.naoExecutadas,
      motivos: resumo.porMotivo,
    }

    // ── Número → linha + faixa fixa (config) ──
    if (tipo === 'numero') {
      return { ...base, grafico: 'linha', ...montarLinha(rs, tipo, cfg) }
    }
    // ── Padrão → faixa varia por ponto: ribbon (faixa única) ou índice normalizado ──
    if (tipo === 'padrao') {
      return { ...base, grafico: 'padrao', ...montarPadrao(rs) }
    }

    // ── Sim/Não e Única escolha ──
    let opcoes: OpcaoRaw[]
    if (tipo === 'sim_nao') {
      opcoes = opcoesSimNao(cfg.esperado)
    } else {
      const { data: ops } = await sb.from('checklist_atividade_opcoes')
        .select('valor, label, e_valido').eq('atividade_id', p.atividade_id).order('ordem')
      opcoes = (ops ?? []).map((o: any) => ({ valor: o.valor, label: o.label, e_valido: o.e_valido }))
    }
    const agg = montarBarras(rs, opcoes, agora, janelaMs) // barras/tendência p/ os cards
    // Sim/Não → taxa de conformidade por dia (linha). Única escolha → composição por dia (empilhado).
    if (tipo === 'sim_nao') {
      return { ...base, grafico: 'conformidade', ...agg, dias: serieConformidade(rs, opcoes) }
    }
    return { ...base, grafico: 'composicao', ...agg, dias: composicaoDiaria(rs, opcoes) }
  }))

  const body = JSON.stringify(
    { dashboard: { nome: dash.nome, transicao_segundos: dash.transicao_segundos, refresh_segundos: dash.refresh_segundos }, paineis },
  )
  cache.set(token, { expira: Date.now() + CACHE_TTL_MS, body })
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Cache': 'MISS' } })
}
