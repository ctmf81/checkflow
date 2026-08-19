// Lógica pura de split de parceiro e de carência por inadimplência.
// Isolada da I/O (Supabase/Asaas) para ser testável — as rotas em
// routes/billing.ts só buscam os dados e delegam a decisão para cá.

import type { SplitItem } from './asaas'

/** Dias de tolerância entre o vencimento da fatura e o corte para somente-leitura. */
export const DIAS_CARENCIA_INADIMPLENCIA = 7

/**
 * Decide o split da mensalidade. Só há repasse com parceiro ATIVO, wallet
 * preenchida e percentual > 0 — qualquer coisa fora disso cobra 100% CheckFlow
 * (retorna undefined, o fallback seguro).
 */
export function montarSplit(input: {
  percentual: number | string | null | undefined
  walletId: string | null | undefined
  statusParceiro: string | null | undefined
}): SplitItem[] | undefined {
  const pct = Number(input.percentual ?? 0)
  const wallet = (input.walletId ?? '').trim()
  if (!wallet) return undefined
  if (input.statusParceiro !== 'ativo') return undefined
  if (!Number.isFinite(pct) || pct <= 0) return undefined
  return [{ walletId: wallet, percentualValue: pct }]
}

/**
 * Âncora da carência: o MENOR vencimento em aberto. Chega um PAYMENT_OVERDUE de
 * uma fatura nova enquanto outra já estava vencida → mantém a mais antiga, para
 * o prazo não reiniciar a cada fatura.
 * Datas em ISO `YYYY-MM-DD` (ordenação lexicográfica = cronológica).
 */
export function vencimentoAncora(atual: string | null | undefined, novo: string | null | undefined): string | null {
  const datas = [atual, novo].filter((d): d is string => !!d).sort()
  return datas[0] ?? null
}

/** Data em que a empresa cai para somente-leitura (vencimento + tolerância). */
export function dataCorteCarencia(vencidoEm: string, dias = DIAS_CARENCIA_INADIMPLENCIA): string {
  const d = new Date(vencidoEm + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Piso pra gerar cobrança de pro-rata em upgrade — abaixo disso, pula
 * a cobrança e só aplica o plano novo (evita fatura de centavos). */
export const PISO_PRO_RATA_UPGRADE = 1

/**
 * Calcula o valor proporcional da diferença de plano no upgrade IMEDIATO,
 * baseado nos dias restantes do período pago atual.
 *
 * Retorna `null` quando:
 *  - Downgrade ou plano igual (só upgrade real cobra pro-rata)
 *  - Ciclos diferentes (mensal↔anual — mantém agendado, sem pro-rata)
 *  - Dias restantes ≤ 0 (período já expirado)
 *  - Cálculo abaixo do `PISO_PRO_RATA_UPGRADE`
 *
 * Fórmula: `diferença × (diasRestantes / diasCicloTotal)`. Ciclo mensal = 30
 * dias, anual = 365 (Asaas usa a mesma base) — simples e previsível.
 * Datas ISO `YYYY-MM-DD` (comparação lexicográfica funciona).
 */
export function calcularProRata(input: {
  valorAtual: number
  valorNovo: number
  cicloAtual: 'mensal' | 'anual' | string | null | undefined
  cicloNovo: 'mensal' | 'anual' | string | null | undefined
  periodoFim: string
  hoje: string
  piso?: number
}): { valor: number; diasRestantes: number; diasCicloTotal: number } | null {
  const diff = Number(input.valorNovo) - Number(input.valorAtual)
  if (!Number.isFinite(diff) || diff <= 0) return null
  if (input.cicloAtual !== input.cicloNovo) return null
  const diasCicloTotal = input.cicloNovo === 'anual' ? 365 : 30
  const inicio = new Date(input.hoje + 'T00:00:00Z')
  const fim = new Date(input.periodoFim + 'T00:00:00Z')
  const diasRestantes = Math.floor((fim.getTime() - inicio.getTime()) / 86400000)
  if (diasRestantes <= 0) return null
  const bruto = diff * (diasRestantes / diasCicloTotal)
  const valor = Math.round(bruto * 100) / 100
  const piso = input.piso ?? PISO_PRO_RATA_UPGRADE
  if (valor < piso) return null
  return { valor, diasRestantes, diasCicloTotal }
}

/**
 * Espelha a regra da função de fase no banco (`empresa_fase_assinatura`):
 * pago + inadimplente + passados os dias de tolerância → somente leitura.
 * O corte é ESTRITAMENTE depois do prazo (no 7º dia ainda opera).
 */
export function cortaAcessoPorInadimplencia(input: {
  planoTipo: string | null | undefined
  status: string | null | undefined
  vencidoEm: string | null | undefined
  hoje: string
  dias?: number
}): boolean {
  if (input.planoTipo !== 'pago') return false
  if (input.status !== 'inadimplente') return false
  if (!input.vencidoEm) return false
  return input.hoje > dataCorteCarencia(input.vencidoEm, input.dias ?? DIAS_CARENCIA_INADIMPLENCIA)
}
