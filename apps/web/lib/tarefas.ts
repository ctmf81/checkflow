// Lógica pura das Listas de Tarefas — usada pelo componente da Operação
// (app/operacao/AbaTarefas.tsx) e coberta por testes unitários em
// tests/unit/lib/tarefas.unit.test.ts.
//
// Centraliza as duas regras-chave da feature:
//  1) JANELA DE ABERTURA — até quando se pode abrir uma nova instância da
//     lista (encerra no que vier primeiro: data limite OU nº de respostas).
//  2) JANELA DE EDIÇÃO — por quanto tempo, após abrir, a instância continua
//     editável.
// e a visibilidade por grupos/subgrupos.

export interface ListaVisibilidade {
  abertura_data_limite: string | null
  abertura_max_respostas: number | null
  total_respostas: number
  grupos: string[]      // grupo_ids atribuídos à lista
  subgrupos: string[]   // subgrupo_ids atribuídos à lista
}

/** A janela de abertura ainda está aberta? (data limite e nº de respostas) */
export function aberturaAberta(l: ListaVisibilidade, agoraMs: number): boolean {
  const dentroData = !l.abertura_data_limite || new Date(l.abertura_data_limite).getTime() > agoraMs
  const dentroQtd = l.abertura_max_respostas == null || l.total_respostas < l.abertura_max_respostas
  return dentroData && dentroQtd
}

/**
 * A lista é visível para o usuário? Se há subgrupos atribuídos, vale a
 * interseção por subgrupo; senão, cai para a interseção por grupo (lista
 * atribuída só a grupos = todos os subgrupos daqueles grupos).
 */
export function visivelPara(
  l: ListaVisibilidade,
  meusGrupos: Set<string>,
  meusSubgrupos: Set<string>,
  isAdmin = false,
): boolean {
  // Admin de sistema "faz parte" de todos os grupos/subgrupos → vê todas.
  if (isAdmin) return true
  if (l.subgrupos.length > 0) return l.subgrupos.some(s => meusSubgrupos.has(s))
  return l.grupos.some(g => meusGrupos.has(g))
}

/** Disponível para responder = janela de abertura aberta E visível ao usuário. */
export function listaDisponivel(
  l: ListaVisibilidade,
  agoraMs: number,
  meusGrupos: Set<string>,
  meusSubgrupos: Set<string>,
  isAdmin = false,
): boolean {
  return aberturaAberta(l, agoraMs) && visivelPara(l, meusGrupos, meusSubgrupos, isAdmin)
}

/** Calcula até quando a instância pode ser editada (null = sem limite próprio). */
export function calcularEditavelAte(abertaEmIso: string, edicaoJanelaHoras: number | null): string | null {
  if (edicaoJanelaHoras == null) return null
  return new Date(new Date(abertaEmIso).getTime() + edicaoJanelaHoras * 3600_000).toISOString()
}

/** A janela de edição da instância já expirou? */
export function edicaoExpirada(editavelAte: string | null, agoraMs: number): boolean {
  return !!editavelAte && new Date(editavelAte).getTime() < agoraMs
}
