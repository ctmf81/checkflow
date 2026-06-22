// Lógica pura de Tickets — usada pelas telas de listagem (gestao/tickets/page.tsx)
// e de detalhe (gestao/tickets/[id]/page.tsx) e coberta por testes unitários em
// tests/unit/lib/tickets.unit.test.ts.
//
// Centraliza as regras de negócio dos tickets:
//  1) VISIBILIDADE — quem enxerga o ticket na listagem (subgrupo + abridor + admin).
//  2) AÇÕES DISPONÍVEIS — o que cada usuário pode fazer conforme status e papel.
//  3) SLA — semáforo de prazo na listagem.
//
// A matemática de cálculo do deadline/pausa de SLA (triggers Postgres) é coberta
// à parte em ticketSla.unit.test.ts.

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type TicketStatus =
  | 'aberto' | 'em_tratamento' | 'aguardando_informacao'
  | 'aguardando_validacao' | 'corrigido' | 'nao_corrigido'
  | 'corrigido_parcialmente' | 'cancelado' | 'improcedente'
// Obs.: 'aguardando_validacao' permanece só por compatibilidade com o enum
// Postgres (ticket_status). O fluxo atual NÃO produz mais esse status — o
// responsável conclui direto e o abridor reabre se discordar.

/** Status considerados "em aberto" (em fluxo, não finalizados). */
export const STATUS_ABERTOS: TicketStatus[] = [
  'aberto', 'em_tratamento', 'aguardando_informacao',
]

/** Não aceito ainda (ninguém assumiu) — "Em aberto" de verdade. */
export const STATUS_NAO_ACEITO: TicketStatus[] = ['aberto']

/** Já aceito e em andamento (alguém assumiu) — "Em tratamento". */
export const STATUS_EM_TRATAMENTO: TicketStatus[] = [
  'em_tratamento', 'aguardando_informacao', 'aguardando_validacao',
]

/** Status finalizados (encerram o ciclo de vida do ticket). */
export const STATUS_FECHADOS: TicketStatus[] = [
  'corrigido', 'nao_corrigido', 'corrigido_parcialmente', 'cancelado', 'improcedente',
]

/** Status de conclusão que o abridor ainda pode reabrir. */
export const STATUS_REABRIVEIS: TicketStatus[] = [
  'corrigido', 'nao_corrigido', 'corrigido_parcialmente',
]

// ─── 1) Visibilidade na listagem ──────────────────────────────────────────────

export interface VisibilidadeCtx {
  userId: string | null
  isAdmin: boolean
  meusSubgrupos: Set<string>
}

/**
 * O usuário pode VER o ticket na listagem?
 * Admin vê todos; demais veem os tickets dos seus subgrupos OU os que abriram.
 */
export function ticketVisivel(
  t: { subgrupo_id: string; aberto_por_id: string },
  ctx: VisibilidadeCtx,
): boolean {
  return ctx.isAdmin || ctx.meusSubgrupos.has(t.subgrupo_id) || t.aberto_por_id === ctx.userId
}

// ─── 2) Ações disponíveis no detalhe ───────────────────────────────────────────

export type Variante = 'primary' | 'danger' | 'ghost'

export interface Acao {
  label: string
  tipo: string
  novoStatus: TicketStatus
  variante: Variante
}

export interface AcoesCtx {
  status: TicketStatus
  /** É membro do subgrupo de destino (ou admin) → pode assumir/tratar. */
  ehDoSubgrupo: boolean
  /** É o responsável atual (assignee) do ticket. */
  ehAssignee: boolean
  /** É quem abriu o ticket. */
  ehAbridor: boolean
  /** Tem a permissão ticket.cancelar (improcedência/cancelamento por gestor). */
  podeCancelar: boolean
  /** Rótulos da empresa para grupo/subgrupo (ex.: "Setor"/"Equipe"). */
  grupoLabel: string
  subgrupoLabel: string
}

/**
 * Lista as ações que o usuário pode executar no ticket, conforme status + papel.
 * Espelha exatamente a lógica de acoesDisponiveis() em gestao/tickets/[id]/page.tsx.
 */
export function acoesDisponiveis(ctx: AcoesCtx): Acao[] {
  const { status: s, ehDoSubgrupo, ehAssignee, ehAbridor, podeCancelar } = ctx
  const acoes: Acao[] = []

  // Aberto: só quem é do subgrupo de destino (ou admin) pode assumir.
  if (s === 'aberto' && ehDoSubgrupo) {
    acoes.push({ label: 'Assumir ticket', tipo: 'aceite', novoStatus: 'em_tratamento', variante: 'primary' })
  }

  // Em tratamento: apenas o responsável movimenta.
  if (s === 'em_tratamento' && ehAssignee) {
    acoes.push({ label: 'Solicitar informação', tipo: 'devolucao', novoStatus: 'aguardando_informacao', variante: 'ghost' })
    // Responsável conclui direto; o abridor é avisado e pode reabrir se discordar.
    acoes.push({ label: 'Concluir: corrigido',         tipo: 'conclusao', novoStatus: 'corrigido',              variante: 'primary' })
    acoes.push({ label: 'Concluir: corrigido parcial', tipo: 'conclusao', novoStatus: 'corrigido_parcialmente', variante: 'ghost' })
    acoes.push({ label: 'Marcar não corrigido',        tipo: 'conclusao', novoStatus: 'nao_corrigido',          variante: 'ghost' })
    acoes.push({ label: `Transferir para outro ${ctx.grupoLabel.toLowerCase()}/${ctx.subgrupoLabel.toLowerCase()}`, tipo: 'transferencia', novoStatus: 'aberto', variante: 'ghost' })
  }

  // Improcedência exige a permissão ticket.cancelar (regra de negócio).
  if (s === 'em_tratamento' && ehAssignee && podeCancelar) {
    acoes.push({ label: 'Marcar improcedente', tipo: 'improcedencia', novoStatus: 'improcedente', variante: 'danger' })
  }

  // Aguardando informação: apenas o abridor responde e retoma.
  if (s === 'aguardando_informacao' && ehAbridor) {
    acoes.push({ label: 'Responder e retomar', tipo: 'resposta_devolucao', novoStatus: 'em_tratamento', variante: 'primary' })
  }

  // Reabertura volta para 'aberto' (sem assignee) — novo aceite é necessário.
  if (STATUS_REABRIVEIS.includes(s) && ehAbridor) {
    acoes.push({ label: 'Reabrir ticket', tipo: 'reabertura', novoStatus: 'aberto', variante: 'ghost' })
  }

  // Comentário sempre disponível em tickets não finalizados.
  if (STATUS_ABERTOS.includes(s)) {
    acoes.push({ label: 'Comentar', tipo: 'comentario', novoStatus: s, variante: 'ghost' })
  }

  // Cancelar: o abridor do ticket OU quem tem a permissão ticket.cancelar.
  if (STATUS_ABERTOS.includes(s) && (ehAbridor || podeCancelar)) {
    acoes.push({ label: 'Cancelar ticket', tipo: 'cancelamento', novoStatus: 'cancelado', variante: 'danger' })
  }

  return acoes
}

// ─── 3) Semáforo de SLA na listagem ────────────────────────────────────────────

export interface SlaCtx {
  status: string
  criado_em: string
  sla_deadline_at: string | null
  sla_segundos_pausados: number
  sla_pausado_em: string | null
}

/**
 * Cor do SLA na listagem (verde/amarelo/vermelho) ou null se não se aplica.
 * Espelha slaStatus() em gestao/tickets/page.tsx.
 *
 * Sem deadline OU ticket fechado → null (não mostra indicador).
 * pct de tempo consumido: >= 1 vermelho, >= 0.8 amarelo, senão verde.
 */
export function slaStatus(
  t: SlaCtx,
  agoraMs: number = Date.now(),
): 'verde' | 'amarelo' | 'vermelho' | null {
  if (!t.sla_deadline_at) return null
  if (STATUS_FECHADOS.includes(t.status as TicketStatus)) return null
  const pausa    = t.sla_pausado_em ? agoraMs - new Date(t.sla_pausado_em).getTime() : 0
  const deadline = new Date(t.sla_deadline_at).getTime() + (t.sla_segundos_pausados * 1000) + pausa
  const total    = deadline - new Date(t.criado_em).getTime()
  const restante = deadline - agoraMs
  const pct      = 1 - restante / total
  if (pct >= 1)   return 'vermelho'
  if (pct >= 0.8) return 'amarelo'
  return 'verde'
}
