'use client'

// Rascunho local de execução de checklist, persistido em IndexedDB.
// Protege as respostas em andamento contra queda de conexão / recarga da
// página. Guarda apenas valores serializáveis — fotos/vídeos (File) ficam
// de fora deste rascunho (são recapturados); o objetivo aqui é não perder
// o que foi digitado/selecionado.

import { idbGet, idbPut, idbDelete } from './idb'

const STORE = 'execucao_drafts'

export interface DraftPayload {
  respostas: Record<string, unknown>
  updatedAt: number
}

// Remove respostas que carregam arquivos (File) — não as persistimos localmente.
function apenasSerializavel(respostas: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(respostas)) {
    if (v instanceof File) continue
    if (v && typeof v === 'object' && (v as { file?: unknown }).file instanceof File) continue
    out[k] = v
  }
  return out
}

export async function salvarDraftLocal(key: string, respostas: Record<string, unknown>): Promise<void> {
  const payload: DraftPayload = {
    respostas: JSON.parse(JSON.stringify(apenasSerializavel(respostas))),
    updatedAt: Date.now(),
  }
  await idbPut(STORE, key, payload)
}

export async function carregarDraftLocal(key: string): Promise<DraftPayload | null> {
  return idbGet<DraftPayload>(STORE, key)
}

export async function removerDraftLocal(key: string): Promise<void> {
  await idbDelete(STORE, key)
}
