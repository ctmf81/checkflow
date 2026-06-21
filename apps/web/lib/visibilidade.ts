// Visibilidade por subgrupo — regra transversal usada na Operação
// (app/operacao/page.tsx) e na gestão de Agendamentos (app/gestao/agendamentos/page.tsx).
// Coberta por testes unitários em tests/unit/lib/visibilidade.unit.test.ts.
//
// Regra central do produto: cada usuário só enxerga o que pertence aos seus
// subgrupos. O admin de sistema "faz parte" de tudo e vê todos os registros.
//
// IMPORTANTE: isto NÃO substitui o RLS do Postgres (que é a barreira de
// segurança real). É o espelho da regra de exibição no cliente, para a UI
// mostrar a cada papel só o que lhe interessa.

export interface CtxSubgrupo {
  isAdmin: boolean
  meusSubgrupos: Set<string>
}

/**
 * O registro (identificado pelo seu subgrupo) é visível ao usuário?
 * Admin vê tudo; demais só veem registros de um subgrupo ao qual pertencem.
 * subgrupo nulo → invisível para não-admin (registro "órfão" sem dono).
 */
export function visivelPorSubgrupo(subgrupoId: string | null | undefined, ctx: CtxSubgrupo): boolean {
  if (ctx.isAdmin) return true
  return subgrupoId != null && ctx.meusSubgrupos.has(subgrupoId)
}

// ─── Operação: checklists avulsos ───────────────────────────────────────────────

export interface ChecklistOperacao {
  id: string
  subgrupo_id: string | null
}

/**
 * O checklist avulso aparece para o operador?
 * Precisa ser visível pelo subgrupo E não estar "em workflow" (esses são
 * executados pelo card de Workflow, evitando a porta-dupla).
 */
export function checklistVisivelOperador(
  cl: ChecklistOperacao,
  ctx: CtxSubgrupo,
  checklistsEmWorkflow: Set<string>,
): boolean {
  return visivelPorSubgrupo(cl.subgrupo_id, ctx) && !checklistsEmWorkflow.has(cl.id)
}

// ─── Agendamentos (gestão) ──────────────────────────────────────────────────────

export interface AgendamentoVis {
  tipo_alvo: 'workflow' | 'checklist'
  workflow_id: string | null
  /** subgrupo do checklist alvo (quando tipo_alvo === 'checklist'). */
  checklist_subgrupo_id: string | null
}

/**
 * O agendamento aparece para o gestor não-admin?
 * - checklist → visível se o subgrupo do checklist é de algum dos meus.
 * - workflow  → visível se ALGUM subgrupo dos itens do workflow é meu.
 * Admin vê todos.
 *
 * @param wfSubgrupos mapa workflow_id → conjunto de subgrupos dos seus itens.
 */
export function agendamentoVisivelGestor(
  ag: AgendamentoVis,
  ctx: CtxSubgrupo,
  wfSubgrupos: Record<string, Set<string>>,
): boolean {
  if (ctx.isAdmin) return true
  if (ag.tipo_alvo === 'checklist') {
    return visivelPorSubgrupo(ag.checklist_subgrupo_id, ctx)
  }
  const set = ag.workflow_id ? wfSubgrupos[ag.workflow_id] : undefined
  return !!set && [...set].some(s => ctx.meusSubgrupos.has(s))
}
