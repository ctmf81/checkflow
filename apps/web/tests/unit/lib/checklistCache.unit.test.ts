// Testes da lib/checklistCache.ts — cache da DEFINIÇÃO de um checklist
// (estrutura, não respostas) em IndexedDB, para renderizar o formulário de
// execução offline. Cobre: formato da chave (checklist + unidade), clone
// estrutural ao gravar e delegação da leitura. Mockamos ./idb.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/idb', () => ({
  idbPut: vi.fn(),
  idbGet: vi.fn(),
  idbGetAll: vi.fn(),
  idbDelete: vi.fn(),
}))

import { chaveChecklist, salvarChecklistCache, carregarChecklistCache, type ChecklistSnapshot } from '@/lib/checklistCache'
import { idbPut, idbGet } from '@/lib/idb'

const STORE = 'checklist_defs'

function snapshot(over: Partial<ChecklistSnapshot> = {}): ChecklistSnapshot {
  return {
    cl: { id: 'cl1', nome: 'Abertura' },
    secoesData: [],
    atvsData: [{ id: 'atv1' }],
    opcoesMap: {},
    motivos: [],
    cachedAt: 123,
    ...over,
  }
}

describe('chaveChecklist', () => {
  it('compõe a chave com checklist e unidade (escopo por unidade)', () => {
    expect(chaveChecklist('cl1', 'uni-9')).toBe('checklist:cl1:uni-9')
  })

  it('mesmo checklist em unidades diferentes gera chaves distintas', () => {
    expect(chaveChecklist('cl1', 'A')).not.toBe(chaveChecklist('cl1', 'B'))
  })
})

describe('salvarChecklistCache', () => {
  beforeEach(() => vi.clearAllMocks())

  it('grava no store checklist_defs com a chave informada', async () => {
    await salvarChecklistCache('checklist:cl1:uni-9', snapshot())
    const call = (idbPut as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)
    expect(call?.[0]).toBe(STORE)
    expect(call?.[1]).toBe('checklist:cl1:uni-9')
  })

  it('serializa (clone estrutural) — gravado não acompanha mutação do original', async () => {
    const snap = snapshot({ atvsData: [{ id: 'atv1', nome: 'x' }] })
    await salvarChecklistCache('k', snap)
    const gravado = (idbPut as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2] as ChecklistSnapshot
    ;(snap.atvsData[0] as Record<string, unknown>).nome = 'MUDOU'
    expect((gravado.atvsData[0] as Record<string, unknown>).nome).toBe('x')
  })
})

describe('carregarChecklistCache', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delega a leitura ao idbGet no store correto', async () => {
    const snap = snapshot()
    ;(idbGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(snap)
    const r = await carregarChecklistCache('checklist:cl1:uni-9')
    expect(idbGet).toHaveBeenCalledWith(STORE, 'checklist:cl1:uni-9')
    expect(r).toEqual(snap)
  })

  it('repassa null quando o checklist não está em cache', async () => {
    ;(idbGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    expect(await carregarChecklistCache('x')).toBeNull()
  })
})
