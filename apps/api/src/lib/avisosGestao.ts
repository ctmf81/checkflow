/**
 * Lógica PURA dos lembretes de gestão ao admin (Fase 3 — pré-cadastros pendentes).
 * Sem I/O: decide se deve lembrar e monta os textos. O route cuida do banco/envio.
 */

/** Idade mínima (dias) de um pré-cadastro pendente para entrar no lembrete. */
export const PRE_CADASTRO_IDADE_MIN_DIAS = 1
/** Intervalo mínimo (dias) entre dois lembretes à mesma empresa (anti-spam). */
export const PRE_CADASTRO_THROTTLE_DIAS = 3

/**
 * Decide se envia o lembrete de pré-cadastros pendentes agora.
 * - Só se há ≥1 pendente elegível.
 * - Respeita o throttle: só reenvia se passou `throttleDias` do último envio.
 */
export function deveLembrarPreCadastros(
  qtdPendentes: number,
  ultimoEnvioIso: string | null | undefined,
  agora: Date,
  throttleDias = PRE_CADASTRO_THROTTLE_DIAS,
): boolean {
  if (qtdPendentes <= 0) return false
  if (!ultimoEnvioIso) return true
  const decorridoMs = agora.getTime() - Date.parse(ultimoEnvioIso)
  return decorridoMs >= throttleDias * 86400000
}

/** Data-limite (ISO) de criação para um pré-cadastro contar como "parado". */
export function limiteIdadePreCadastro(agora: Date, idadeMinDias = PRE_CADASTRO_IDADE_MIN_DIAS): string {
  return new Date(agora.getTime() - idadeMinDias * 86400000).toISOString()
}

export function mensagemWaPreCadastros(nomeEmpresa: string, qtd: number, link: string): string {
  const plural = qtd === 1 ? 'pessoa aguardando' : 'pessoas aguardando'
  const item = qtd === 1 ? 'um pré-cadastro' : `${qtd} pré-cadastros`
  return `👥 *CheckFlow — ${item} para aprovar*\n\n`
    + `A *${nomeEmpresa}* tem *${qtd} ${plural}* aprovação de acesso. `
    + `Enquanto não aprovar, elas não conseguem usar o sistema.\n\n`
    + `Revise em Acessos → Usuários:\n🔗 ${link}`
}
