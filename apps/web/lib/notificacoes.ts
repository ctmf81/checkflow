/**
 * Notificações WhatsApp via Evolution API (proxy na API Fastify)
 *
 * Todas as funções são fire-and-forget: falhas são silenciosas
 * para nunca bloquear o fluxo principal da aplicação.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

async function notificarPlanoAcao(payload: {
  plano_id: string
  evento: 'aberto' | 'enviado_n2' | 'devolvido_n1'
  observacao: string
  ator_nome: string
}): Promise<void> {
  if (!API_URL) return
  try {
    await fetch(`${API_URL}/planos-acao/notificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Silencioso — Evolution pode estar offline
  }
}

/**
 * Disparar quando um plano de ação é aberto durante a execução.
 * Notifica todos os usuários N1 e N2 do subgrupo.
 */
export function notificarPlanoAberto(params: {
  plano_id: string
  observacao: string
  ator_nome: string
}): void {
  // fire-and-forget — não await
  notificarPlanoAcao({ ...params, evento: 'aberto' })
}

/**
 * Disparar quando N1 escala o plano para N2.
 * Notifica todos os usuários N2 do subgrupo.
 */
export function notificarPlanoEnviadoN2(params: {
  plano_id: string
  observacao: string
  ator_nome: string
}): void {
  notificarPlanoAcao({ ...params, evento: 'enviado_n2' })
}

/**
 * Disparar quando N2 devolve o plano para N1.
 * Notifica todos os usuários N1 do subgrupo.
 */
export function notificarPlanoDevolvidoN1(params: {
  plano_id: string
  observacao: string
  ator_nome: string
}): void {
  notificarPlanoAcao({ ...params, evento: 'devolvido_n1' })
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

/**
 * Dispara WhatsApp + Email para o evento de um ticket.
 * Fire-and-forget — nunca bloqueia o fluxo principal.
 *
 * evento 'aberto'   → notifica todos do grupo/subgrupo destino no turno
 * outros eventos    → notifica abridor + assignee (exceto o ator)
 */
export function notificarTicket(params: {
  ticket_id: string
  evento: string
  ator_id: string
  texto: string
}): void {
  if (!API_URL) return
  fetch(`${API_URL}/tickets/notificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).catch(() => {}) // silencioso
}
