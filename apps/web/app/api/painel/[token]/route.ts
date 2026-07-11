import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { montarLinha, montarBarras, montarPadrao, serieConformidade, composicaoDiaria, opcoesSimNao, type OpcaoRaw } from '@/lib/painelDados'

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
    .select('id, ordem, titulo, atividade_id, janela_horas, atividade:atividade_id(nome, tipo, config)')
    .eq('dashboard_id', dash.id).order('ordem')

  const agora = Date.now()
  const paineis = await Promise.all((paineisRaw ?? []).map(async (p: any) => {
    const atv = Array.isArray(p.atividade) ? p.atividade[0] : p.atividade
    const tipo: string = atv?.tipo ?? 'texto'
    const cfg = atv?.config ?? {}
    const titulo = p.titulo || atv?.nome || 'Painel'
    const janelaMs = p.janela_horas * 3600_000
    const corte = new Date(agora - janelaMs).toISOString()

    const { data: respostas } = await sb.from('checklist_execucao_respostas')
      .select('resposta, criado_em')
      .eq('atividade_id', p.atividade_id)
      .gte('criado_em', corte)
      .order('criado_em', { ascending: true })
      .limit(MAX_PONTOS)

    const base = { id: p.id, titulo, tipo, janela_horas: p.janela_horas }
    const rs = (respostas ?? []) as { resposta: any; criado_em: string }[]

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
