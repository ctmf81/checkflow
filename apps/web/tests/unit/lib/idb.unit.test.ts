// Testes da lib/idb.ts — acesso centralizado ao IndexedDB do app offline.
//
// O contrato bespoke desta lib é a DEGRADAÇÃO SILENCIOSA: em modo privado /
// cota estourada / navegador sem IndexedDB, nada pode lançar — leitura volta
// null/[] e escrita/remoção viram no-op. Esse é o comportamento que protege a
// tela de operação de quebrar quando o storage local não está disponível.
//
// jsdom não implementa IndexedDB, então `indexedDB` já é undefined aqui — é
// exatamente o cenário "indisponível". Forçamos o estado explicitamente para
// não depender da versão do jsdom.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, idbGet, idbGetAll, idbPut, idbDelete } from '@/lib/idb'

describe('idb — IndexedDB indisponível (modo privado / sem suporte)', () => {
  let original: PropertyDescriptor | undefined

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    // Garante o cenário "indisponível" de forma determinística.
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true })
  })

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original)
  })

  it('openDb rejeita com erro quando indexedDB não existe', async () => {
    await expect(openDb()).rejects.toThrow('IndexedDB indisponível')
  })

  it('idbGet retorna null em vez de lançar', async () => {
    await expect(idbGet('execucao_drafts', 'qualquer')).resolves.toBeNull()
  })

  it('idbGetAll retorna [] em vez de lançar', async () => {
    await expect(idbGetAll('pending_submissions')).resolves.toEqual([])
  })

  it('idbPut resolve como no-op (não lança)', async () => {
    await expect(idbPut('checklist_defs', 'k', { a: 1 })).resolves.toBeUndefined()
  })

  it('idbDelete resolve como no-op (não lança)', async () => {
    await expect(idbDelete('catalogo_cache', 'k')).resolves.toBeUndefined()
  })
})
