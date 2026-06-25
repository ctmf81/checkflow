// Espelho de apps/web/lib/checklistEngine.ts
// Funções puras de lógica de checklist — dependências, visibilidade, progresso
// Roda identicamente em web e mobile

import type { Atividade } from './tipos'

export type Respostas = Record<string, any>

function gatilhoBate(dep: Atividade, respostaPai: any): boolean {
  if (!dep.valor_gatilho) return true
  return Array.isArray(respostaPai)
    ? respostaPai.includes(dep.valor_gatilho)
    : String(respostaPai ?? '') === dep.valor_gatilho
}

function dependentesVisiveis(a: Atividade, respostas: Respostas): Atividade[] {
  return (a.dependentes ?? []).filter(dep => gatilhoBate(dep, respostas[a.id]))
}

/**
 * Conta total e respondidas, considerando só atividades visíveis por gatilho.
 */
export function calcularProgresso(
  secoes: { atividades: Atividade[] }[],
  respostas: Respostas
): { total: number; respondidas: number } {
  let total = 0, respondidas = 0

  function contar(atividades: Atividade[]) {
    atividades.forEach(a => {
      total++
      const r = respostas[a.id]
      if (r !== undefined && r !== null && r !== '' && !(Array.isArray(r) && r.length === 0)) {
        respondidas++
      }
      const visiveis = dependentesVisiveis(a, respostas)
      if (visiveis.length) contar(visiveis)
    })
  }

  secoes.forEach(s => contar(s.atividades))
  return { total, respondidas }
}

/**
 * Lista flat de atividades visíveis, achata a árvore respeitando gatilhos.
 */
export function listarAtividadesVisiveis(
  secoes: { atividades: Atividade[] }[],
  respostas: Respostas
): Atividade[] {
  const lista: Atividade[] = []

  function coletar(atividades: Atividade[]) {
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
 * Calcula resultado global: aprovado ou reprovado.
 * Reprovado se qualquer atividade visível for não conforme (validacao() === false).
 */
export function calcularResultadoGlobal(
  visiveis: Atividade[],
  calcularValidacao: (a: Atividade) => boolean | null
): 'aprovado' | 'reprovado' {
  const naoConformes = visiveis.filter(a => calcularValidacao(a) === false)
  return naoConformes.length > 0 ? 'reprovado' : 'aprovado'
}

/**
 * Retorna lista de atividades obrigatórias não respondidas (dentre as visíveis).
 */
export function atividedesObrigatoriosPendentes(
  visiveis: Atividade[]
): Atividade[] {
  return visiveis.filter(a => a.obrigatoria && (!a.resposta || a.resposta === '' || (Array.isArray(a.resposta) && a.resposta.length === 0)))
}
