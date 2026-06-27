// Testes da lib/catalogoCache.ts — cache dos VALORES de catálogo para a
// atividade tipo "catálogo" funcionar offline. Cobre: buscarCatalogo (shape do
// retorno + null quando nada existe) e a regra de salvarCatalogoCache de NÃO
// gravar imagem_url (offline a URL do storage não carregaria; só pesaria).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/idb', () => ({
  idbPut: vi.fn(),
  idbGet: vi.fn(),
  idbGetAll: vi.fn(),
  idbDelete: vi.fn(),
}))

import { buscarCatalogo, salvarCatalogoCache, carregarCatalogoCache, type CatalogoSnapshot } from '@/lib/catalogoCache'
import { idbPut, idbGet } from '@/lib/idb'

const STORE = 'catalogo_cache'

// Mock de Supabase por tabela: chains passthrough; .single() e o await direto
// resolvem o resultado configurado para aquela tabela.
function makeSb(byTable: Record<string, { data: unknown }>) {
  return {
    from(table: string) {
      const result = byTable[table] ?? { data: null }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain
      chain.single = () => Promise.resolve(result)
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej)
      return chain
    },
  } as never
}

describe('buscarCatalogo', () => {
  it('retorna catálogo + valores quando ambos existem', async () => {
    const cat = { id: 'cat1', nome: 'Produtos', campo_chave: 'sku' }
    const vals = [{ id: 'v1', valor_chave: 'A' }, { id: 'v2', valor_chave: 'B' }]
    const sb = makeSb({ catalogos: { data: cat }, catalogo_valores: { data: vals } })
    expect(await buscarCatalogo(sb, 'cat1')).toEqual({ catalogo: cat, valores: vals })
  })

  it('retorna null quando catálogo e valores não existem', async () => {
    const sb = makeSb({ catalogos: { data: null }, catalogo_valores: { data: null } })
    expect(await buscarCatalogo(sb, 'cat1')).toBeNull()
  })

  it('normaliza valores ausentes para [] quando há catálogo', async () => {
    const cat = { id: 'cat1', nome: 'Produtos' }
    const sb = makeSb({ catalogos: { data: cat }, catalogo_valores: { data: null } })
    expect(await buscarCatalogo(sb, 'cat1')).toEqual({ catalogo: cat, valores: [] })
  })

  it('normaliza catálogo ausente para null quando há valores', async () => {
    const vals = [{ id: 'v1' }]
    const sb = makeSb({ catalogos: { data: null }, catalogo_valores: { data: vals } })
    expect(await buscarCatalogo(sb, 'cat1')).toEqual({ catalogo: null, valores: vals })
  })
})

describe('salvarCatalogoCache', () => {
  beforeEach(() => vi.clearAllMocks())

  function payloadGravado(): CatalogoSnapshot {
    return (idbPut as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2] as CatalogoSnapshot
  }

  it('grava no store catalogo_cache com a chave = id do catálogo', async () => {
    await salvarCatalogoCache('cat1', { catalogo: { id: 'cat1' }, valores: [] })
    const call = (idbPut as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)
    expect(call?.[0]).toBe(STORE)
    expect(call?.[1]).toBe('cat1')
  })

  it('remove imagem_url de cada valor antes de gravar', async () => {
    const snap: CatalogoSnapshot = {
      catalogo: { id: 'cat1' },
      valores: [
        { id: 'v1', valor_chave: 'A', imagem_url: 'https://storage/x.png' },
        { id: 'v2', valor_chave: 'B', imagem_url: 'https://storage/y.png' },
      ],
    }
    await salvarCatalogoCache('cat1', snap)
    const gravado = payloadGravado()
    expect(gravado.valores).toEqual([
      { id: 'v1', valor_chave: 'A' },
      { id: 'v2', valor_chave: 'B' },
    ])
    expect(gravado.valores.every(v => !('imagem_url' in v))).toBe(true)
  })

  it('preserva o catálogo e os demais atributos do valor', async () => {
    const snap: CatalogoSnapshot = {
      catalogo: { id: 'cat1', nome: 'Produtos', campo_chave: 'sku' },
      valores: [{ id: 'v1', valor_chave: 'A', atributo_1: 'azul', imagem_url: 'u' }],
    }
    await salvarCatalogoCache('cat1', snap)
    const gravado = payloadGravado()
    expect(gravado.catalogo).toEqual({ id: 'cat1', nome: 'Produtos', campo_chave: 'sku' })
    expect(gravado.valores[0]).toEqual({ id: 'v1', valor_chave: 'A', atributo_1: 'azul' })
  })

  it('não muta o snapshot original ao remover imagem_url', async () => {
    const snap: CatalogoSnapshot = {
      catalogo: { id: 'cat1' },
      valores: [{ id: 'v1', imagem_url: 'u' }],
    }
    await salvarCatalogoCache('cat1', snap)
    expect(snap.valores[0]).toHaveProperty('imagem_url', 'u')
  })
})

describe('carregarCatalogoCache', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delega a leitura ao idbGet no store correto', async () => {
    const snap = { catalogo: { id: 'cat1' }, valores: [] }
    ;(idbGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(snap)
    const r = await carregarCatalogoCache('cat1')
    expect(idbGet).toHaveBeenCalledWith(STORE, 'cat1')
    expect(r).toEqual(snap)
  })

  it('repassa null quando o catálogo não está em cache', async () => {
    ;(idbGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    expect(await carregarCatalogoCache('cat1')).toBeNull()
  })
})
