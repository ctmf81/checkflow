// Validador PURO de um VerticalTemplate. A rota do gerador confia que o template
// está bem-formado; este validador (usado em teste) garante isso: estrutura
// coerente, checklists apontando para grupo/subgrupo existentes, atividades que
// validam com gabarito de conformidade, catálogos referenciados existentes e
// pesos de desfecho positivos.

import type { VerticalTemplate, AtividadeTemplate } from './tipos'

/** Tipos de atividade que reprovam (precisam de gabarito de conformidade). */
const TIPOS_QUE_VALIDAM = new Set(['sim_nao', 'numero', 'multipla_escolha'])

function problemasDaAtividade(a: AtividadeTemplate, ctx: string, catalogos: Set<string>): string[] {
  const p: string[] = []
  if (!a.nome?.trim()) p.push(`${ctx}: atividade sem nome`)

  if (a.tipo === 'numero' && a.faixa) {
    if (a.faixa.min > a.faixa.max) p.push(`${ctx} "${a.nome}": faixa min>max`)
  }
  if (a.tipo === 'numero' && !a.faixa) p.push(`${ctx} "${a.nome}": número que valida precisa de faixa`)

  if (a.tipo === 'multipla_escolha') {
    if (!a.opcoes?.length) p.push(`${ctx} "${a.nome}": múltipla escolha sem opções`)
    if (!a.opcoesConformes?.length) p.push(`${ctx} "${a.nome}": múltipla escolha sem opções conformes`)
    for (const c of a.opcoesConformes ?? []) {
      if (!a.opcoes?.includes(c)) p.push(`${ctx} "${a.nome}": opção conforme "${c}" não está entre as opções`)
    }
  }

  if (a.tipo === 'sim_nao' && a.simConforme && a.simConforme !== 'sim' && a.simConforme !== 'nao') {
    p.push(`${ctx} "${a.nome}": simConforme inválido`)
  }

  if (a.tipo === 'catalogo' && (!a.catalogo || !catalogos.has(a.catalogo))) {
    p.push(`${ctx} "${a.nome}": catálogo "${a.catalogo ?? ''}" não existe no template`)
  }
  return p
}

/** Retorna a lista de problemas (vazia = template OK). */
export function validarTemplate(t: VerticalTemplate): string[] {
  const problemas: string[] = []

  if (!t.id?.trim()) problemas.push('template sem id')
  if (!t.nome?.trim()) problemas.push('template sem nome')
  if (!t.estrutura?.length) problemas.push('template sem estrutura (grupos)')
  if (!t.checklists?.length) problemas.push('template sem checklists')

  // Mapa grupo → subgrupos válidos
  const subgruposPorGrupo = new Map<string, Set<string>>()
  for (const g of t.estrutura ?? []) {
    if (!g.subgrupos?.length) problemas.push(`grupo "${g.grupo}" sem subgrupos`)
    subgruposPorGrupo.set(g.grupo, new Set(g.subgrupos ?? []))
  }

  const catalogos = new Set((t.catalogos ?? []).map(c => c.nome))
  for (const c of t.catalogos ?? []) {
    if (!c.campoChave?.trim()) problemas.push(`catálogo "${c.nome}" sem campo-chave`)
    if (!c.itens?.length) problemas.push(`catálogo "${c.nome}" sem itens`)
    for (const item of c.itens ?? []) {
      if (!(c.campoChave in item)) problemas.push(`catálogo "${c.nome}": item sem o campo-chave "${c.campoChave}"`)
    }
  }

  for (const cl of t.checklists ?? []) {
    const ctx = `checklist "${cl.nome}"`
    const subs = subgruposPorGrupo.get(cl.grupo)
    if (!subs) problemas.push(`${ctx}: grupo "${cl.grupo}" não existe na estrutura`)
    else if (!subs.has(cl.subgrupo)) problemas.push(`${ctx}: subgrupo "${cl.subgrupo}" não existe no grupo "${cl.grupo}"`)

    if (!cl.secoes?.length) problemas.push(`${ctx}: sem seções`)
    let temValidacao = false
    for (const s of cl.secoes ?? []) {
      if (!s.atividades?.length) problemas.push(`${ctx} › seção "${s.nome}": sem atividades`)
      for (const a of s.atividades ?? []) {
        problemas.push(...problemasDaAtividade(a, `${ctx} › ${s.nome}`, catalogos))
        if (TIPOS_QUE_VALIDAM.has(a.tipo)) temValidacao = true
      }
    }
    // Um checklist que pode reprovar precisa de ao menos 1 atividade que valida.
    const podeReprovar = Object.entries(cl.pesos ?? {}).some(([k, v]) => k !== 'aprovada' && (v ?? 0) > 0)
    if (podeReprovar && !temValidacao) problemas.push(`${ctx}: tem desfecho de reprovação mas nenhuma atividade que valida`)

    const totalPesos = Object.values(cl.pesos ?? {}).reduce((s, v) => s + (v ?? 0), 0)
    if (totalPesos <= 0) problemas.push(`${ctx}: pesos de desfecho somam zero`)
  }

  // Usuários: precisa de ao menos um operador (autor das execuções).
  if (!(t.usuarios ?? []).some(u => u.papel === 'operador')) {
    problemas.push('template sem usuário de papel operador (autor das execuções)')
  }

  return problemas
}
