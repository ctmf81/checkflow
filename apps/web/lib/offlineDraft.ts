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
  // Planos de ação em preenchimento (parte serializável: observação/causa raiz).
  // Fotos/vídeo do plano NÃO entram aqui (File não é serializável) — quem chama
  // já remove a mídia antes de passar; são recapturados ao reabrir, como nas
  // respostas. Ainda é só rascunho local: o registro em `planos_acao` só nasce
  // no finalizar, atrelado à execução (nunca um plano órfão no servidor).
  planos?: Record<string, unknown>
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

export async function salvarDraftLocal(
  key: string,
  respostas: Record<string, unknown>,
  planos?: Record<string, unknown>,
): Promise<void> {
  const payload: DraftPayload = {
    respostas: JSON.parse(JSON.stringify(apenasSerializavel(respostas))),
    updatedAt: Date.now(),
  }
  if (planos && Object.keys(planos).length > 0) {
    payload.planos = JSON.parse(JSON.stringify(planos))
  }
  await idbPut(STORE, key, payload)
}

export async function carregarDraftLocal(key: string): Promise<DraftPayload | null> {
  return idbGet<DraftPayload>(STORE, key)
}

export async function removerDraftLocal(key: string): Promise<void> {
  await idbDelete(STORE, key)
}
