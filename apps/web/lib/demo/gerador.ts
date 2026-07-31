// Motor PURO do gerador de dados de demonstração.
//
// Sem dependência de banco: produz o CRONOGRAMA (quando cada execução
// aconteceu, dentro dos dias úteis/horário da janela de 30 dias) e os DESFECHOS
// (aprovada / reprovada / com plano de ação), de forma DETERMINÍSTICA (RNG
// semeado) para ser testável. A persistência — mapear isto para as tabelas
// checklist_execucoes / planos_acao / tickets / tarefas — é responsabilidade da
// rota (Fase 2). Aqui é só a lógica de distribuição e sorteio.

export type Rng = () => number // retorna [0, 1)

/** PRNG determinístico (mulberry32) — mesma seed, mesma sequência. */
export function criarRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Inteiro em [min, max] (inclusivo). */
export function inteiro(rng: Rng, min: number, max: number): number {
  if (max < min) [min, max] = [max, min]
  return Math.floor(rng() * (max - min + 1)) + min
}

/** Um item do array (assume array não vazio). */
export function escolher<T>(rng: Rng, itens: readonly T[]): T {
  return itens[Math.floor(rng() * itens.length)]
}

/** Segunda a sexta. */
export function ehDiaUtil(d: Date): boolean {
  const dia = d.getDay()
  return dia >= 1 && dia <= 5
}

export interface JanelaConfig {
  agora: Date
  dias: number // tamanho da janela (ex.: 30)
  porDiaMin: number // execuções por dia útil (mínimo)
  porDiaMax: number // execuções por dia útil (máximo)
  horaInicio: number // hora de início do expediente (ex.: 8)
  horaFim: number // hora de fim, exclusiva (ex.: 18 = última execução às 17h59)
}

/**
 * Timestamps de execução dentro dos dias úteis e do horário de expediente da
 * janela [agora - dias, agora]. Ordenados do mais antigo ao mais recente.
 * Nunca gera timestamp no futuro (corta em `agora`).
 */
export function distribuirExecucoes(cfg: JanelaConfig, rng: Rng): Date[] {
  const out: Date[] = []
  const inicio = new Date(cfg.agora)
  inicio.setDate(inicio.getDate() - cfg.dias)
  inicio.setHours(0, 0, 0, 0)

  for (const dia = new Date(inicio); dia <= cfg.agora; dia.setDate(dia.getDate() + 1)) {
    if (!ehDiaUtil(dia)) continue
    const qtd = inteiro(rng, cfg.porDiaMin, cfg.porDiaMax)
    for (let i = 0; i < qtd; i++) {
      const hora = inteiro(rng, cfg.horaInicio, cfg.horaFim - 1)
      const ts = new Date(dia)
      ts.setHours(hora, inteiro(rng, 0, 59), inteiro(rng, 0, 59), 0)
      if (ts <= cfg.agora) out.push(ts)
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Sorteia exatamente `n` timestamps em dias úteis dentro da janela [agora-dias,
 * agora), no horário de expediente. Exclui o dia de hoje (evita cair no futuro).
 * Ordenados do mais antigo ao mais recente. Usado para gerar um total fixo de
 * execuções (ex.: 80), independente da quantidade de checklists.
 */
export function sortearDatas(
  agora: Date, dias: number, n: number, horaInicio: number, horaFim: number, rng: Rng,
): Date[] {
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0)
  const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - dias)
  const uteis: Date[] = []
  for (const d = new Date(inicio); d < hoje; d.setDate(d.getDate() + 1)) {
    if (ehDiaUtil(d)) uteis.push(new Date(d))
  }
  if (uteis.length === 0) return []
  const out: Date[] = []
  for (let i = 0; i < n; i++) {
    const dia = escolher(rng, uteis)
    const ts = new Date(dia)
    ts.setHours(inteiro(rng, horaInicio, horaFim - 1), inteiro(rng, 0, 59), inteiro(rng, 0, 59), 0)
    out.push(ts)
  }
  return out.sort((a, b) => a.getTime() - b.getTime())
}

// ── Status da execução ───────────────────────────────────────────────────────

export type StatusExecucao = 'concluido' | 'em_andamento' | 'nao_executado'

/**
 * Sorteia o status da execução para dar variedade à demo. Maioria concluída
 * (tem resultado/respostas/planos); uma parcela em andamento e não executada.
 */
export function sortearStatus(rng: Rng): StatusExecucao {
  const r = rng()
  if (r < 0.78) return 'concluido'
  if (r < 0.9) return 'em_andamento'
  return 'nao_executado'
}

// ── Desfechos ────────────────────────────────────────────────────────────────

export type Desfecho =
  | 'aprovada' // execução aprovada, sem não conformidade
  | 'reprovada_sem_plano' // reprovada, mas sem plano de ação aberto
  | 'plano_aberto_n1' // reprovada → plano em moderação N1
  | 'plano_aberto_n2' // reprovada → plano escalado para N2
  | 'plano_corrigido' // reprovada → plano tratado e corrigido
  | 'plano_nao_corrigido' // reprovada → plano encerrado como não corrigido

export type PesosDesfecho = Partial<Record<Desfecho, number>>

/**
 * Sorteia um desfecho conforme pesos relativos (não precisam somar 1).
 * Pesos ausentes/≤0 são ignorados. Determinístico via `rng`.
 */
export function sortearDesfecho(rng: Rng, pesos: PesosDesfecho): Desfecho {
  const entradas = (Object.entries(pesos) as [Desfecho, number][]).filter(([, p]) => (p ?? 0) > 0)
  if (entradas.length === 0) return 'aprovada'
  const total = entradas.reduce((s, [, p]) => s + p, 0)
  let r = rng() * total
  for (const [d, p] of entradas) {
    r -= p
    if (r < 0) return d
  }
  return entradas[entradas.length - 1][0]
}

/** Resultado da execução (coluna `resultado` de checklist_execucoes). */
export function resultadoDoDesfecho(d: Desfecho): 'aprovado' | 'reprovado' {
  return d === 'aprovada' ? 'aprovado' : 'reprovado'
}

/** Se o desfecho abre plano de ação. */
export function temPlano(d: Desfecho): boolean {
  return d.startsWith('plano_')
}

/**
 * Status do plano de ação (coluna `status` de planos_acao), ou null quando o
 * desfecho não gera plano. Espelha o check da tabela.
 */
export function statusPlanoDoDesfecho(d: Desfecho): 'em_moderacao_n1' | 'em_moderacao_n2' | 'corrigido' | 'nao_corrigido' | null {
  switch (d) {
    case 'plano_aberto_n1':
      return 'em_moderacao_n1'
    case 'plano_aberto_n2':
      return 'em_moderacao_n2'
    case 'plano_corrigido':
      return 'corrigido'
    case 'plano_nao_corrigido':
      return 'nao_corrigido'
    default:
      return null
  }
}
