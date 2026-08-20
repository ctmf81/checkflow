// Regras PURAS do ciclo de vida da assinatura (fase). Centralizadas para o
// AssinaturaGate (banner/bloqueio) e para os botões de criação (pós-trial =
// somente leitura), e cobertas por testes — o que roda é o que se testa.
//
// Fases atuais (o SQL `empresa_fase_assinatura` só retorna estas duas):
//   • 'ativa'    — uso normal
//   • 'carencia' — pós-trial ou inadimplente >7d: somente-leitura permanente
//     até assinar/regularizar. O ramo 'bloqueada' foi consolidado em 'carencia'
//     em 2026-07-22 (migration 20260722120000). Historicamente 'bloqueada'
//     existiu como "período gratuito acabou" — hoje não é mais devolvida pelo
//     banco. Mantido no union type por compat com dados antigos.

export type FaseAssinatura = 'ativa' | 'carencia' | (string & {})

/**
 * Criar CONTEÚDO (checklist, tarefa, ticket, agendamento, workflow) é permitido?
 * Só na fase 'ativa' — carência = somente leitura.
 */
export function podeCriarConteudo(fase: FaseAssinatura): boolean {
  return fase === 'ativa'
}

/** Mensagem padrão do bloqueio de criação (pós-trial / inadimplente >7d). */
export const MSG_CRIACAO_BLOQUEADA =
  'Criação bloqueada — período de teste encerrado (somente consulta)'

export type EstadoAssinaturaGate =
  | { tipo: 'nada' }                      // fase ativa, ou ainda carregando
  | { tipo: 'banner'; bloqueada: boolean }// carência: banner amarelo (todos)

/**
 * O que o AssinaturaGate deve renderizar, dado (fase, isAdmin, pronto):
 *  • não pronto ou 'ativa' → nada
 *  • carência (fase != ativa) → banner amarelo para todos (independe de admin)
 *
 * `bloqueada` no retorno fica sempre `false` — mantido por compat com callers
 * que ainda mostram cor vermelha. Se aparecer uma fase futura de bloqueio
 * total, ela volta aqui.
 */
export function estadoAssinaturaGate(
  fase: FaseAssinatura,
  _isAdmin: boolean,
  pronto: boolean,
): EstadoAssinaturaGate {
  if (!pronto || fase === 'ativa') return { tipo: 'nada' }
  return { tipo: 'banner', bloqueada: false }
}
