/**
 * Notificações WhatsApp via Evolution API (proxy na API Fastify)
 *
 * Todas as funções são fire-and-forget: falhas são silenciosas
 * para nunca bloquear o fluxo principal da aplicação.
 */

import { apiFetch } from './apiClient'

async function notificarPlanoAcao(payload: {
  plano_id: string
  evento: 'aberto' | 'enviado_n2' | 'devolvido_n1'
  observacao: string
  ator_nome: string
}): Promise<void> {
  try {
    await apiFetch('/planos-acao/notificar', { method: 'POST', body: JSON.stringify(payload) })
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
  apiFetch('/tickets/notificar', { method: 'POST', body: JSON.stringify(params) }).catch(() => {}) // silencioso
}

/**
 * Vincula um ticket como duplicado de um principal. NÃO é fire-and-forget: a UI
 * precisa do resultado (sucesso → recarrega; erro → mostra a mensagem da API).
 */
export async function vincularTicketDuplicado(params: {
  principal_id: string; duplicado_id: string; ator_id: string
}): Promise<{ ok: boolean; error?: string; principal_numero?: number; principal_id?: string }> {
  try {
    const res = await apiFetch('/tickets/vincular', { method: 'POST', body: JSON.stringify(params) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error ?? 'Falha ao vincular' }
    return { ok: true, principal_numero: json?.principal_numero, principal_id: json?.principal_id }
  } catch {
    return { ok: false, error: 'Não foi possível conectar ao servidor' }
  }
}

/** Desfaz o vínculo de um duplicado (volta para "Aberto"). */
export async function desvincularTicketDuplicado(params: {
  duplicado_id: string; ator_id: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch('/tickets/desvincular', { method: 'POST', body: JSON.stringify(params) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error ?? 'Falha ao desvincular' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível conectar ao servidor' }
  }
}
