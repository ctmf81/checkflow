'use client'

// Rascunho local de execução de checklist, persistido em IndexedDB.
// Protege as respostas em andamento contra queda de conexão / recarga da
// página. Guarda apenas valores serializáveis — fotos/vídeos (File) ficam
// de fora deste rascunho (são recapturados); o objetivo aqui é não perder
// o que foi digitado/selecionado.
//
// Esta é a base da Fase 2 (offline). A submissão 100% offline virá depois.

const DB_NAME = 'checkflow'
const STORE = 'execucao_drafts'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

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
  try {
    const db = await openDb()
    const payload: DraftPayload = {
      respostas: JSON.parse(JSON.stringify(apenasSerializavel(respostas))),
      updatedAt: Date.now(),
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(payload, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // IndexedDB pode falhar (modo privado, cota). Silencioso: é só um espelho local.
  }
}

export async function carregarDraftLocal(key: string): Promise<DraftPayload | null> {
  try {
    const db = await openDb()
    const result = await new Promise<DraftPayload | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as DraftPayload) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result
  } catch {
    return null
  }
}

export async function removerDraftLocal(key: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // silencioso
  }
}
