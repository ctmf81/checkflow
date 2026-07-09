import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(typeof v === 'object' ? v.numero : v)
  return isNaN(n) ? null : n
}

// Tendência da NÃO-CONFORMIDADE: compara a 1ª metade vs a 2ª metade da janela.
// 'alta' = piorando (mais não-conforme); 'queda' = melhorando.
function tendencia(pontos: { t: number; nc: boolean }[], agora: number, janelaMs: number): 'alta' | 'queda' | 'estavel' {
  const meio = agora - janelaMs / 2
  const p1 = pontos.filter(p => p.t < meio)
  const p2 = pontos.filter(p => p.t >= meio)
  if (p1.length === 0 || p2.length === 0) return 'estavel'
  const taxa = (arr: typeof pontos) => arr.filter(p => p.nc).length / arr.length
  const d = taxa(p2) - taxa(p1)
  if (d > 0.05) return 'alta'
  if (d < -0.05) return 'queda'
  return 'estavel'
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
    const rs = respostas ?? []

    // ── Número / Padrão → série temporal + linha(s) de referência ──
    if (tipo === 'numero' || tipo === 'padrao') {
      const serie = rs.map((r: any) => ({ t: r.criado_em, v: num(r.resposta) })).filter(p => p.v !== null)
      let refMin: number | null = null, refMax: number | null = null
      if (tipo === 'numero') {
        refMin = cfg.min ?? null; refMax = cfg.max ?? null
      } else {
        // padrão: usa a faixa da resposta mais recente com instância resolvida
        for (let i = rs.length - 1; i >= 0; i--) {
          const rr: any = rs[i].resposta
          if (rr && typeof rr === 'object' && (rr.valor_min != null || rr.valor_max != null)) {
            refMin = rr.valor_min != null ? Number(rr.valor_min) : null
            refMax = rr.valor_max != null ? Number(rr.valor_max) : null
            break
          }
        }
      }
      return { ...base, grafico: 'linha', unidade: cfg.unidade ?? '', serie, ref: { min: refMin, max: refMax }, total: serie.length }
    }

    // ── Sim/Não e Única escolha → barras por opção + tendência ──
    let opcoes: { valor: string; label: string; e_valido: boolean }[]
    if (tipo === 'sim_nao') {
      const esperado = cfg.esperado ?? null
      opcoes = [
        { valor: 'sim', label: 'Sim', e_valido: esperado ? esperado === 'sim' : true },
        { valor: 'nao', label: 'Não', e_valido: esperado ? esperado === 'nao' : true },
      ]
    } else {
      const { data: ops } = await sb.from('checklist_atividade_opcoes')
        .select('valor, label, e_valido').eq('atividade_id', p.atividade_id).order('ordem')
      opcoes = (ops ?? []).map((o: any) => ({ valor: o.valor, label: o.label, e_valido: o.e_valido }))
    }

    const validoPorValor = new Map(opcoes.map(o => [o.valor, o.e_valido]))
    const contagem = new Map<string, number>()
    const pontos: { t: number; nc: boolean }[] = []
    for (const r of rs as any[]) {
      const val = Array.isArray(r.resposta) ? r.resposta[0] : r.resposta
      if (val === null || val === undefined || typeof val === 'object') continue
      const key = String(val)
      contagem.set(key, (contagem.get(key) ?? 0) + 1)
      const valido = validoPorValor.get(key)
      pontos.push({ t: new Date(r.criado_em).getTime(), nc: valido === false })
    }
    const barras = opcoes.map(o => ({ label: o.label, count: contagem.get(o.valor) ?? 0, conforme: o.e_valido }))
    const naoConformes = pontos.filter(p => p.nc).length
    return {
      ...base, grafico: 'barras', barras,
      total: pontos.length, naoConformes,
      tendencia: tendencia(pontos, agora, janelaMs),
    }
  }))

  const body = JSON.stringify(
    { dashboard: { nome: dash.nome, transicao_segundos: dash.transicao_segundos, refresh_segundos: dash.refresh_segundos }, paineis },
  )
  cache.set(token, { expira: Date.now() + CACHE_TTL_MS, body })
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Cache': 'MISS' } })
}
