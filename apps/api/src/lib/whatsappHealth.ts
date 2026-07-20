/**
 * Lógica PURA do healthcheck do WhatsApp. Sem I/O: decide, a partir do último
 * estado conhecido e do estado atual, SE deve alertar e QUAL a transição.
 *
 * Antes essa decisão vivia inline no route com um `let` em memória — o que
 * quebrava o anti-spam com múltiplas réplicas. Agora o último estado vem do
 * banco (`sistema_estado`) e esta função só decide, ficando testável.
 */

export type TransicaoWhatsapp = 'caiu' | 'voltou' | null

export interface DecisaoAlertaWhatsapp {
  /** Houve mudança real em relação ao último estado conhecido. */
  mudou: boolean
  /** Primeira observação da série e já está fora (sem estado anterior). */
  caiuPrimeiraVez: boolean
  /** Deve disparar alerta (painel + e-mail) agora. */
  alertar: boolean
  /** Direção da transição a alertar, quando `alertar` é true. */
  transicao: TransicaoWhatsapp
}

/**
 * @param ultimoOk último estado conhecido: `true` conectado, `false` fora,
 *   `null` quando ainda não há registro (primeira checagem).
 * @param okAgora estado medido nesta checagem.
 */
export function decidirAlertaWhatsapp(
  ultimoOk: boolean | null,
  okAgora: boolean,
): DecisaoAlertaWhatsapp {
  const mudou = ultimoOk !== null && ultimoOk !== okAgora
  const caiuPrimeiraVez = ultimoOk === null && !okAgora

  // Caiu: mudou de conectado→fora, ou já nasceu fora na 1ª checagem.
  if (!okAgora && (mudou || caiuPrimeiraVez)) {
    return { mudou, caiuPrimeiraVez, alertar: true, transicao: 'caiu' }
  }
  // Voltou: só quando houve mudança real fora→conectado (não alerta na 1ª
  // checagem já conectado — nada de anormal a comunicar).
  if (okAgora && mudou) {
    return { mudou, caiuPrimeiraVez, alertar: true, transicao: 'voltou' }
  }
  return { mudou, caiuPrimeiraVez, alertar: false, transicao: null }
}
