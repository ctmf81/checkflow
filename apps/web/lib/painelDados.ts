// Lógica PURA dos painéis de Dashboard — usada pela rota /api/painel/[token] e
// coberta por testes em tests/unit/lib/painelDados.unit.test.ts. Sem I/O: recebe
// as respostas já carregadas e devolve o payload do painel.

export interface RespostaRaw { resposta: any; criado_em: string }
export interface OpcaoRaw { valor: string; label: string; e_valido: boolean }
export interface ExecucaoRaw { status: string; motivo: string | null }

/**
 * Resumo de execução para o rodapé do painel: quantas execuções do checklist
 * dessa atividade concluíram vs foram marcadas "não executado" na janela, e os
 * motivos das não execuções agrupados (mais frequente primeiro). Enxerga a
 * AUSÊNCIA que os gráficos de resposta não mostram (não-execução não gera linha).
 */
export function resumoExecucao(execs: ExecucaoRaw[]) {
  let concluidas = 0, naoExecutadas = 0
  const motivos = new Map<string, number>()
  for (const e of execs) {
    if (e.status === 'concluido') concluidas++
    else if (e.status === 'nao_executado') {
      naoExecutadas++
      const m = (e.motivo ?? '').trim() || 'Sem motivo'
      motivos.set(m, (motivos.get(m) ?? 0) + 1)
    }
  }
  const porMotivo = [...motivos.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([motivo, count]) => ({ motivo, count }))
  return { concluidas, naoExecutadas, porMotivo }
}

/** Valor numérico da resposta (número, string numérica, ou {numero} do padrão). */
export function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(typeof v === 'object' ? v.numero : v)
  return isNaN(n) ? null : n
}

/**
 * Tendência da NÃO-CONFORMIDADE: compara a taxa da 1ª metade vs a 2ª metade da
 * janela. 'alta' = piorando (mais não-conforme); 'queda' = melhorando.
 * Precisa de pontos nas duas metades; senão 'estavel'. Limiar de 5pp p/ ruído.
 */
export function tendencia(pontos: { t: number; nc: boolean }[], agoraMs: number, janelaMs: number): 'alta' | 'queda' | 'estavel' {
  const meio = agoraMs - janelaMs / 2
  const p1 = pontos.filter(p => p.t < meio)
  const p2 = pontos.filter(p => p.t >= meio)
  if (p1.length === 0 || p2.length === 0) return 'estavel'
  const taxa = (arr: typeof pontos) => arr.filter(p => p.nc).length / arr.length
  const d = taxa(p2) - taxa(p1)
  if (d > 0.05) return 'alta'
  if (d < -0.05) return 'queda'
  return 'estavel'
}

/** Opções sintéticas de sim/não (conformidade pelo `esperado` do config). */
export function opcoesSimNao(esperado: string | null | undefined): OpcaoRaw[] {
  return [
    { valor: 'sim', label: 'Sim', e_valido: esperado ? esperado === 'sim' : true },
    { valor: 'nao', label: 'Não', e_valido: esperado ? esperado === 'nao' : true },
  ]
}

/** Painel de número/padrão: série temporal + linha(s) de referência. */
export function montarLinha(rs: RespostaRaw[], tipo: string, cfg: any) {
  const serie = rs
    .map(r => ({ t: r.criado_em, v: num(r.resposta) }))
    .filter((p): p is { t: string; v: number } => p.v !== null)
  let refMin: number | null = null, refMax: number | null = null
  if (tipo === 'numero') {
    refMin = cfg?.min ?? null; refMax = cfg?.max ?? null
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
  return { serie, ref: { min: refMin, max: refMax }, unidade: cfg?.unidade ?? '', total: serie.length }
}

/** Agrupa respostas por dia (UTC, AAAA-MM-DD) em ordem cronológica. */
export function agruparPorDia<T extends RespostaRaw>(rs: T[]): { dia: string; itens: T[] }[] {
  const m = new Map<string, T[]>()
  for (const r of rs) {
    const dia = String(r.criado_em).slice(0, 10)
    const arr = m.get(dia)
    if (arr) arr.push(r); else m.set(dia, [r])
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([dia, itens]) => ({ dia, itens }))
}

/** Valor escolhido de uma resposta de opção (string; array→[0]); null se objeto/vazio. */
function valEscolhido(resposta: any): string | null {
  const v = Array.isArray(resposta) ? resposta[0] : resposta
  if (v === null || v === undefined || typeof v === 'object') return null
  return String(v)
}

/** Sim/Não: taxa de conformidade POR DIA (série temporal). pct null em dia sem resposta válida. */
export function serieConformidade(rs: RespostaRaw[], opcoes: OpcaoRaw[]) {
  const valido = new Map(opcoes.map(o => [o.valor, o.e_valido]))
  return agruparPorDia(rs).map(({ dia, itens }) => {
    let total = 0, conformes = 0
    for (const r of itens) {
      const v = valEscolhido(r.resposta); if (v === null) continue
      total++; if (valido.get(v) !== false) conformes++
    }
    return { dia, total, conformes, pct: total ? Math.round((conformes / total) * 100) : null }
  })
}

/** Única escolha: composição (contagem por opção) POR DIA — para barras empilhadas. */
export function composicaoDiaria(rs: RespostaRaw[], opcoes: OpcaoRaw[]) {
  return agruparPorDia(rs).map(({ dia, itens }) => {
    const cont = new Map<string, number>()
    let total = 0
    for (const r of itens) {
      const v = valEscolhido(r.resposta); if (v === null) continue
      cont.set(v, (cont.get(v) ?? 0) + 1); total++
    }
    return { dia, total, seg: opcoes.map(o => ({ valor: o.valor, label: o.label, conforme: o.e_valido, count: cont.get(o.valor) ?? 0 })) }
  })
}

/**
 * Painel de PADRÃO: a faixa aceitável varia por ponto (depende da combinação de
 * variáveis). `ribbon` quando a faixa é ÚNICA na janela (unidades reais); senão
 * `indice` — normaliza cada ponto pela SUA faixa (0 = centro, ±100 = borda),
 * tornando combinações diferentes comparáveis num eixo só.
 */
export function montarPadrao(rs: RespostaRaw[]) {
  const pts = rs.map(r => {
    const o: any = r.resposta
    const temObj = o && typeof o === 'object'
    return {
      t: r.criado_em, v: num(r.resposta),
      min: temObj && o.valor_min != null ? Number(o.valor_min) : null,
      max: temObj && o.valor_max != null ? Number(o.valor_max) : null,
    }
  }).filter((p): p is { t: string; v: number; min: number | null; max: number | null } => p.v !== null)

  const comFaixa = pts.filter(p => p.min != null && p.max != null)
  const faixas = new Set(comFaixa.map(p => `${p.min}|${p.max}`))

  if (pts.length > 0 && comFaixa.length === pts.length && faixas.size === 1) {
    const fora = pts.filter(p => p.v < (p.min as number) || p.v > (p.max as number)).length
    return { modo: 'ribbon' as const, serie: pts, ref: { min: pts[0].min, max: pts[0].max }, total: pts.length, fora }
  }

  const serie = pts.map(p => {
    if (p.min == null || p.max == null || p.max === p.min) return { t: p.t, idx: null as number | null }
    const centro = (p.min + p.max) / 2, meia = (p.max - p.min) / 2
    return { t: p.t, idx: Math.round(((p.v - centro) / meia) * 100) }
  })
  const fora = serie.filter(s => s.idx != null && Math.abs(s.idx) > 100).length
  return { modo: 'indice' as const, serie, total: serie.length, fora }
}

/** Painel de sim/não e única escolha: barras por opção + tendência. */
export function montarBarras(rs: RespostaRaw[], opcoes: OpcaoRaw[], agoraMs: number, janelaMs: number) {
  const validoPorValor = new Map(opcoes.map(o => [o.valor, o.e_valido]))
  const contagem = new Map<string, number>()
  const pontos: { t: number; nc: boolean }[] = []
  for (const r of rs) {
    const val = Array.isArray(r.resposta) ? r.resposta[0] : r.resposta
    if (val === null || val === undefined || typeof val === 'object') continue
    const key = String(val)
    contagem.set(key, (contagem.get(key) ?? 0) + 1)
    pontos.push({ t: new Date(r.criado_em).getTime(), nc: validoPorValor.get(key) === false })
  }
  const barras = opcoes.map(o => ({ label: o.label, count: contagem.get(o.valor) ?? 0, conforme: o.e_valido }))
  return { barras, total: pontos.length, naoConformes: pontos.filter(p => p.nc).length, tendencia: tendencia(pontos, agoraMs, janelaMs) }
}

// ── Painel de CHECKLIST (monitora o checklist inteiro, não uma atividade) ──────

export interface ExecChecklistRaw {
  status: string
  resultado: string | null
  motivo: string | null
  data_execucao: string
  iniciado_em: string | null
}
export interface RespostaConformeRaw { atividade_id: string; nome: string; conforme: boolean | null }

/** Placar da janela: concluídas (aprovadas/reprovadas), não executadas e % de aprovação. */
export function placarChecklist(execs: ExecChecklistRaw[]) {
  let aprovados = 0, reprovados = 0, naoExecutados = 0
  for (const e of execs) {
    if (e.status === 'nao_executado') naoExecutados++
    else if (e.status === 'concluido') {
      if (e.resultado === 'reprovado') reprovados++
      else aprovados++ // aprovado ou null (sem resultado) → conta como aprovado
    }
  }
  const executados = aprovados + reprovados
  const pctAprovacao = executados ? Math.round((aprovados / executados) * 100) : null
  return { executados, aprovados, reprovados, naoExecutados, pctAprovacao }
}

/** Conformidade por dia (aprovado × reprovado) das execuções concluídas — barras empilhadas. */
export function conformidadePorDiaExec(execs: ExecChecklistRaw[]) {
  const rs = execs
    .filter(e => e.status === 'concluido')
    .map(e => ({ resposta: e.resultado, criado_em: e.data_execucao }))
  return agruparPorDia(rs).map(({ dia, itens }) => {
    let aprovados = 0, reprovados = 0
    for (const it of itens) { if (it.resposta === 'reprovado') reprovados++; else aprovados++ }
    return { dia, aprovados, reprovados, total: aprovados + reprovados }
  })
}

/**
 * Tempo médio de execução (segundos) das concluídas COM `iniciado_em` (execução
 * "de uma vez"). null se não há amostra — execuções antigas/pausadas ficam de fora.
 */
export function tempoMedioExecucao(execs: ExecChecklistRaw[]) {
  const durs: number[] = []
  for (const e of execs) {
    if (e.status !== 'concluido' || !e.iniciado_em) continue
    const ms = new Date(e.data_execucao).getTime() - new Date(e.iniciado_em).getTime()
    if (ms > 0) durs.push(ms)
  }
  if (durs.length === 0) return null
  const media = durs.reduce((a, b) => a + b, 0) / durs.length
  return { segundos: Math.round(media / 1000), amostras: durs.length }
}

/** Top atividades não conformes da janela (usa `conforme` já gravado na resposta). */
export function topNaoConformes(rs: RespostaConformeRaw[], limite = 5) {
  const mapa = new Map<string, { nome: string; total: number; naoConformes: number }>()
  for (const r of rs) {
    if (r.conforme == null) continue
    const m = mapa.get(r.atividade_id) ?? { nome: r.nome, total: 0, naoConformes: 0 }
    m.total++; if (r.conforme === false) m.naoConformes++
    mapa.set(r.atividade_id, m)
  }
  return [...mapa.values()]
    .filter(v => v.naoConformes > 0)
    .map(v => ({ atividade: v.nome, naoConformes: v.naoConformes, total: v.total, taxa: Math.round((v.naoConformes / v.total) * 100) }))
    .sort((a, b) => b.naoConformes - a.naoConformes)
    .slice(0, limite)
}

/** Resumo dos planos de ação (tratamento das reprovações) por status. */
export function resumoPlanos(status: string[]) {
  const c = (s: string) => status.filter(x => x === s).length
  return { corrigidos: c('corrigido'), naoCorrigidos: c('nao_corrigido'), aguardN1: c('em_moderacao_n1'), aguardN2: c('em_moderacao_n2') }
}
