/**
 * Notificações WhatsApp via Evolution API (proxy na API Fastify)
 *
 * Todas as funções são fire-and-forget: falhas são silenciosas
 * para nunca bloquear o fluxo principal da aplicação.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

async function notificarPlanoAcao(payload: {
  plano_id: string
  evento: 'aberto' | 'enviado_n2'
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
