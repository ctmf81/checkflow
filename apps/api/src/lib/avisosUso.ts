/**
 * Lógica PURA dos alertas de limite de uso ao admin da empresa (Fase 1).
 *
 * Sem I/O: recebe os números de uso já lidos e a função de idempotência,
 * devolve quais avisos disparar. O route (`routes/avisos-uso.ts`) cuida das
 * leituras/escritas no banco e do envio WhatsApp/e-mail.
 *
 * Gatilhos: 80% (heads-up) e 100% (limite atingido). Idempotência por período
 * de cobrança → cada aviso sai 1× por recurso × faixa × período.
 */

export type RecursoUso = 'execucoes' | 'tokens_ia' | 'armazenamento'
export type FaixaAviso = '80' | '100'

export const RECURSOS: RecursoUso[] = ['execucoes', 'tokens_ia', 'armazenamento']

export interface UsoRecurso {
  usado: number
  /** null = ilimitado (não gera alerta). */
  limite: number | null
  /** créditos de pacote (capacidade adicional). */
  extra: number
}

export interface AvisoPendente {
  recurso: RecursoUso
  faixa: FaixaAviso
  /** percentual arredondado, para a mensagem. */
  pct: number
}

/**
 * Percentual de uso considerando o `extra` de pacotes. `null` quando ilimitado
 * (limite null) ou sem capacidade (limite+extra ≤ 0) — nesses casos não alerta.
 */
export function percentualUso(u: UsoRecurso): number | null {
  if (u.limite == null) return null
  const capacidade = u.limite + (u.extra ?? 0)
  if (capacidade <= 0) return null
  return (u.usado / capacidade) * 100
}

/** Faixa de aviso atual: '100' se ≥100%, '80' se ≥80% e <100%, senão null. */
export function faixaAtual(u: UsoRecurso): FaixaAviso | null {
  const pct = percentualUso(u)
  if (pct == null) return null
  if (pct >= 100) return '100'
  if (pct >= 80) return '80'
  return null
}

/**
 * Dado o uso dos recursos e um predicado de idempotência (já avisou este
 * recurso+faixa neste período?), devolve os avisos a enviar agora.
 *
 * Só a faixa ATUAL de cada recurso é considerada: quem pula de <80% direto
 * para 100% recebe só o alerta de 100% (mais urgente, já contém a info).
 */
export function avisosPendentes(
  usos: Record<RecursoUso, UsoRecurso>,
  jaAvisado: (recurso: RecursoUso, faixa: FaixaAviso) => boolean,
): AvisoPendente[] {
  const pendentes: AvisoPendente[] = []
  for (const recurso of RECURSOS) {
    const faixa = faixaAtual(usos[recurso])
    if (!faixa) continue
    if (jaAvisado(recurso, faixa)) continue
    pendentes.push({ recurso, faixa, pct: Math.round(percentualUso(usos[recurso])!) })
  }
  return pendentes
}

// ─── Textos (plataforma; não editáveis pelo cliente) ──────────────────────────

const ROTULO: Record<RecursoUso, string> = {
  execucoes: 'execuções do mês',
  tokens_ia: 'tokens de IA do mês',
  armazenamento: 'armazenamento',
}

/** Rótulo legível do recurso, para assunto/corpo. */
export function rotuloRecurso(recurso: RecursoUso): string {
  return ROTULO[recurso]
}

/**
 * O que o admin faz a respeito, por recurso. Execuções/tokens resetam no
 * período (comprar pacote / subir de plano); armazenamento é permanente
 * (liberar espaço via tempo de guarda, ou ampliar).
 */
export function orientacaoRecurso(recurso: RecursoUso): string {
  if (recurso === 'armazenamento') {
    return 'O armazenamento é permanente: para liberar espaço, ajuste o tempo de guarda das mídias ou amplie o plano / compre mais espaço.'
  }
  return 'Este limite reinicia no próximo período da assinatura. Para não interromper a operação agora, compre um pacote adicional ou faça upgrade do plano.'
}

/** Frase-núcleo compartilhada por WhatsApp e e-mail. */
export function fraseLimite(recurso: RecursoUso, faixa: FaixaAviso, pct: number): string {
  const alvo = rotuloRecurso(recurso)
  return faixa === '100'
    ? `o limite de ${alvo} da sua empresa foi *atingido* (${pct}% da capacidade).`
    : `a sua empresa já usou *${pct}%* do limite de ${alvo}.`
}
