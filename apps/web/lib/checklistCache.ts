'use client'

// Cache da DEFINIÇÃO de um checklist (estrutura, não respostas) em IndexedDB.
// Permite renderizar o formulário de execução offline: quando a tela carrega
// online, guarda o snapshot; quando está sem rede, restaura daqui.

import { idbGet, idbPut } from './idb'

const STORE = 'checklist_defs'

export interface ChecklistSnapshot {
  cl: Record<string, unknown>
  secoesData: Record<string, unknown>[]
  atvsData: Record<string, unknown>[]
  opcoesMap: Record<string, Record<string, unknown>[]>
  motivos: { id: string; descricao: string; tipo: string }[]
  cachedAt: number
}

// Chave única por checklist + unidade (o mesmo checklist pode ter escopo por
// unidade no acesso).
export function chaveChecklist(checklistId: string, unidadeId: string): string {
  return `checklist:${checklistId}:${unidadeId}`
}

export async function salvarChecklistCache(key: string, snapshot: ChecklistSnapshot): Promise<void> {
  // Serializa para garantir clonabilidade estrutural (sem refs estranhas).
  await idbPut(STORE, key, JSON.parse(JSON.stringify(snapshot)))
}

export async function carregarChecklistCache(key: string): Promise<ChecklistSnapshot | null> {
  return idbGet<ChecklistSnapshot>(STORE, key)
}
