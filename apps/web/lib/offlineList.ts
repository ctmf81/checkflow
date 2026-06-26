'use client'

// Cache da LISTA de checklists disponíveis offline, por unidade. Guardado em
// localStorage (metadados pequenos). Quando o operador está sem internet, a
// tela de operação monta a lista a partir daqui, mostrando só os checklists
// marcados como "disponível offline".

const PREFIXO = 'checkflow:offline-list:'

export function salvarListaOffline(unidadeId: string, lista: unknown[]): void {
  try {
    localStorage.setItem(PREFIXO + unidadeId, JSON.stringify(lista))
  } catch {
    // cota / modo privado: ignora
  }
}

export function carregarListaOffline<T = unknown>(unidadeId: string): T[] {
  try {
    const raw = localStorage.getItem(PREFIXO + unidadeId)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}
