// Lógica pura da árvore de permissões de Perfil — usada por
// app/gestao/acessos/perfis/PerfilModal.tsx e coberta por testes em
// tests/unit/lib/perfis.unit.test.ts.
//
// Permissão é gravada como string `recurso.acao` (ou só `recurso` para
// recursos sem ações, ex: 'home'). O conjunto marcado é um Set<string>.
// Centralizar isto evita o tipo de bug que apagava permissões na edição.

export interface Acao { key: string; label: string }
export interface Recurso { key: string; label: string; acoes: Acao[] }

export function permKey(recurso: string, acao?: string): string {
  return acao ? `${recurso}.${acao}` : recurso
}

/** Recurso totalmente marcado? (sem ações = o próprio recurso; com ações = todas marcadas) */
export function recursoChecked(r: Recurso, perms: Set<string>): boolean {
  if (r.acoes.length === 0) return perms.has(r.key)
  return r.acoes.every(a => perms.has(permKey(r.key, a.key)))
}

/** Recurso parcialmente marcado? (algumas ações sim, outras não) */
export function recursoIndeterminate(r: Recurso, perms: Set<string>): boolean {
  if (r.acoes.length === 0) return false
  const marcadas = r.acoes.filter(a => perms.has(permKey(r.key, a.key))).length
  return marcadas > 0 && marcadas < r.acoes.length
}

/** Alterna o recurso inteiro: se está tudo marcado, desmarca tudo; senão, marca tudo. */
export function toggleRecurso(r: Recurso, perms: Set<string>): Set<string> {
  const n = new Set(perms)
  if (r.acoes.length === 0) {
    n.has(r.key) ? n.delete(r.key) : n.add(r.key)
  } else {
    const tudoMarcado = recursoChecked(r, perms)
    r.acoes.forEach(a => {
      const k = permKey(r.key, a.key)
      tudoMarcado ? n.delete(k) : n.add(k)
    })
  }
  return n
}

/** Alterna uma ação específica. */
export function toggleAcao(recurso: string, acao: string, perms: Set<string>): Set<string> {
  const n = new Set(perms)
  const k = permKey(recurso, acao)
  n.has(k) ? n.delete(k) : n.add(k)
  return n
}

/** Constrói o Set de permissões a partir das linhas (recurso, acao) do banco. */
export function permsFromRows(rows: { recurso: string; acao: string }[]): Set<string> {
  const set = new Set<string>()
  rows.forEach(r => { if (r) set.add(permKey(r.recurso, r.acao)) })
  return set
}

/** Dado o catálogo de permissões do banco + o Set marcado, devolve os ids a inserir. */
export function permissaoIdsToInsert(
  permsDb: { id: string; recurso: string; acao: string }[],
  perms: Set<string>,
): string[] {
  return permsDb
    .filter(p => perms.has(permKey(p.recurso, p.acao)) || perms.has(p.recurso))
    .map(p => p.id)
}
