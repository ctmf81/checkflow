// Espelho em TypeScript de 3 trechos de lógica pura de
// `app/operacao/[id]/page.tsx` que vivem como closures internas
// (calcularProgresso, listarAtividadesVisiveis, e o cálculo de
// `resultado` dentro de finalizar()) — extraídas aqui como funções
// puras para permitir teste unitário sem montar o componente inteiro.
//
// ⚠️ IMPORTANTE: mantenha esta lógica em sincronia com a do componente.
// Qualquer mudança na regra de visibilidade de dependentes ou no
// critério de aprovação/reprovação deve ser replicada nos dois lugares
// (e nos testes em tests/unit/lib/checklistEngine.unit.test.ts).

export interface AtividadeMin {
  id: string
  obrigatoria?: boolean
  valor_gatilho?: string | null
  dependentes?: AtividadeMin[]
  [key: string]: any
}

export type Respostas = Record<string, any>

function gatilhoBate(dep: AtividadeMin, respostaPai: any): boolean {
  if (!dep.valor_gatilho) return true
  return Array.isArray(respostaPai) ? respostaPai.includes(dep.valor_gatilho) : String(respostaPai ?? '') === dep.valor_gatilho
}

function dependentesVisiveis(a: AtividadeMin, respostas: Respostas): AtividadeMin[] {
  return (a.dependentes ?? []).filter(dep => gatilhoBate(dep, respostas[a.id]))
}

/** Espelho de calcularProgresso(): conta total e respondidas considerando só atividades visíveis. */
export function calcularProgresso(secoes: { atividades: AtividadeMin[] }[], respostas: Respostas): { total: number; respondidas: number } {
  let total = 0, respondidas = 0
  function contar(atividades: AtividadeMin[]) {
    atividades.forEach(a => {
      total++
      const r = respostas[a.id]
      if (r !== undefined && r !== null && r !== '' && !(Array.isArray(r) && r.length === 0)) respondidas++
      const visiveis = dependentesVisiveis(a, respostas)
      if (visiveis.length) contar(visiveis)
    })
  }
  secoes.forEach(s => contar(s.atividades))
  return { total, respondidas }
}

/** Espelho de listarAtividadesVisiveis(): achata a árvore respeitando gatilhos, anexando a resposta. */
export function listarAtividadesVisiveis(secoes: { atividades: AtividadeMin[] }[], respostas: Respostas): AtividadeMin[] {
  const lista: AtividadeMin[] = []
  function coletar(atividades: AtividadeMin[]) {
    atividades.forEach(a => {
      lista.push({ ...a, resposta: respostas[a.id] })
      const visiveis = dependentesVisiveis(a, respostas)
      if (visiveis.length) coletar(visiveis)
    })
  }
  secoes.forEach(s => coletar(s.atividades))
  return lista
}

/**
 * Espelho do cálculo de `resultado` em finalizar():
 * 'reprovado' se QUALQUER atividade visível for não conforme (calcularValidacao === false),
 * 'aprovado' caso contrário (conforme ou indeterminado/null não reprovam).
 */
export function calcularResultadoGlobal(
  visiveis: AtividadeMin[],
  calcularValidacao: (a: AtividadeMin) => boolean | null
): 'aprovado' | 'reprovado' {
  const naoConformes = visiveis.filter(a => calcularValidacao(a) === false)
  return naoConformes.length > 0 ? 'reprovado' : 'aprovado'
}
