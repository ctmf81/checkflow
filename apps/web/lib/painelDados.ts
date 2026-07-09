// Lógica PURA dos painéis de Dashboard — usada pela rota /api/painel/[token] e
// coberta por testes em tests/unit/lib/painelDados.unit.test.ts. Sem I/O: recebe
// as respostas já carregadas e devolve o payload do painel.

export interface RespostaRaw { resposta: any; criado_em: string }
export interface OpcaoRaw { valor: string; label: string; e_valido: boolean }

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
