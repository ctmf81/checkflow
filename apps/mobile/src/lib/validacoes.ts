// Espelho de operacao/[id]/page.tsx (web)
// Lógica pura de validação — roda em web e mobile identicamente

import type { Atividade } from './tipos'

/**
 * Calcula se uma atividade respondida é conforme ou não.
 * @returns true = conforme ✓ | false = não conforme ✗ | null = sem validação
 */
export function calcularValidacao(atividade: Atividade): boolean | null {
  const val = atividade.resposta
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'object' && val?._nao_executavel) return null

  const cfg = atividade.config ?? {}

  // ─── Sim/Não ───────────────────────────────────────────────────────────
  if (atividade.tipo === 'sim_nao') {
    if (!cfg.esperado) return null
    return val === cfg.esperado
  }

  // ─── Número ────────────────────────────────────────────────────────────
  if (atividade.tipo === 'numero') {
    const n = Number(val)
    if (isNaN(n)) return null
    if (cfg.min !== null && cfg.min !== undefined && n < cfg.min) return false
    if (cfg.max !== null && cfg.max !== undefined && n > cfg.max) return false
    return true
  }

  // ─── Padrão (validação complexa) ──────────────────────────────────────
  if (atividade.tipo === 'padrao') {
    // resposta foi resolvida no CampoPadrao: { numero, instancia_id, valor_min, valor_max }
    if (typeof val !== 'object') return null
    if (!val.instancia_id) return null // sem combo → não dá validar
    const n = Number(val.numero)
    if (isNaN(n)) return null
    if (val.valor_min !== null && val.valor_min !== undefined && n < Number(val.valor_min)) return false
    if (val.valor_max !== null && val.valor_max !== undefined && n > Number(val.valor_max)) return false
    return true
  }

  // ─── Múltipla Escolha ──────────────────────────────────────────────────
  if (atividade.tipo === 'multipla_escolha') {
    const opcoes = atividade.opcoesMC ?? []
    if (!opcoes.length) return null
    const selecionados = Array.isArray(val) ? val : [val]
    if (selecionados.length === 0) return null
    // Não conforme se alguma selecionada tem e_valido=false OU não existe mais
    const temInvalido = selecionados.some(v => {
      const op = opcoes.find(o => o.valor === v || o.label === v)
      return !op || !op.e_valido
    })
    return !temInvalido
  }

  // ─── Demais tipos (sem validação automática) ──────────────────────────
  // catalogo, texto, foto, video, assinatura, data_hora, localizacao
  return null
}

/**
 * Lista todas as atividades visíveis (respeitando dependências por gatilho).
 * Flatten da árvore respeitando valor_gatilho do pai.
 */
export function listarAtividadesVisiveis(
  secoes: { atividades: Atividade[] }[],
  respostas: Record<string, any>
): Atividade[] {
  const lista: Atividade[] = []

  function gatilhoBate(dep: Atividade, respostaPai: any): boolean {
    if (!dep.valor_gatilho) return true
    return Array.isArray(respostaPai)
      ? respostaPai.includes(dep.valor_gatilho)
      : String(respostaPai ?? '') === dep.valor_gatilho
  }

  function dependentesVisiveis(a: Atividade, respostas: Record<string, any>): Atividade[] {
    return (a.dependentes ?? []).filter(dep => gatilhoBate(dep, respostas[a.id]))
  }

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
 * Calcula aprovado/reprovado baseado nas validações das atividades visíveis.
 * Reprovado se QUALQUER atividade visível for não conforme (false).
 * Indeterminado (null) não reprova.
 */
export function calcularResultadoGlobal(
  visiveis: Atividade[]
): 'aprovado' | 'reprovado' {
  const naoConformes = visiveis.filter(a => calcularValidacao(a) === false)
  return naoConformes.length > 0 ? 'reprovado' : 'aprovado'
}

/**
 * Conta total e respondidas de atividades visíveis (para barra de progresso).
 */
export function calcularProgresso(
  secoes: { atividades: Atividade[] }[],
  respostas: Record<string, any>
): { total: number; respondidas: number } {
  let total = 0, respondidas = 0

  function gatilhoBate(dep: Atividade, respostaPai: any): boolean {
    if (!dep.valor_gatilho) return true
    return Array.isArray(respostaPai)
      ? respostaPai.includes(dep.valor_gatilho)
      : String(respostaPai ?? '') === dep.valor_gatilho
  }

  function dependentesVisiveis(a: Atividade, respostas: Record<string, any>): Atividade[] {
    return (a.dependentes ?? []).filter(dep => gatilhoBate(dep, respostas[a.id]))
  }

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
