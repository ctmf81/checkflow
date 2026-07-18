// Regras PURAS do ciclo de vida da assinatura (fase). Centralizadas para o
// AssinaturaGate (banner/bloqueio) e para os botões de criação (pós-trial =
// somente leitura), e cobertas por testes — o que roda é o que se testa.
//
// Fases: 'ativa' (uso normal) · 'carencia' (pós-trial, somente leitura) ·
// 'bloqueada' (período gratuito + carência terminaram). Empresa sem plano
// pago = 'ativa'.

export type FaseAssinatura = 'ativa' | 'carencia' | 'bloqueada' | (string & {})

/**
 * Criar CONTEÚDO (checklist, tarefa, ticket, agendamento, workflow) é permitido?
 * Só na fase 'ativa' — carência/bloqueada = somente leitura.
 */
export function podeCriarConteudo(fase: FaseAssinatura): boolean {
  return fase === 'ativa'
}

/** Mensagem padrão do bloqueio de criação (pós-trial). */
export const MSG_CRIACAO_BLOQUEADA =
  'Criação bloqueada — período de teste encerrado (somente consulta)'

export type EstadoAssinaturaGate =
  | { tipo: 'nada' }                         // fase ativa, ou ainda carregando
  | { tipo: 'bloqueio_total' }               // bloqueada + usuário comum
  | { tipo: 'banner'; bloqueada: boolean }   // carência (todos) OU bloqueada (admin)

/**
 * O que o AssinaturaGate deve renderizar, dado (fase, isAdmin, pronto):
 *  • não pronto ou 'ativa' → nada
 *  • 'bloqueada' + não-admin → tela cheia de bloqueio
 *  • carência (todos) ou bloqueada para admin → banner (bloqueada=cor vermelha)
 */
export function estadoAssinaturaGate(
  fase: FaseAssinatura,
  isAdmin: boolean,
  pronto: boolean,
): EstadoAssinaturaGate {
  if (!pronto || fase === 'ativa') return { tipo: 'nada' }
  if (fase === 'bloqueada' && !isAdmin) return { tipo: 'bloqueio_total' }
  return { tipo: 'banner', bloqueada: fase === 'bloqueada' }
}
