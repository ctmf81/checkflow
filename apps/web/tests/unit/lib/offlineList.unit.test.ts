// Testes da lib/offlineList.ts — cache em localStorage da LISTA de checklists
// disponíveis offline, por unidade. Cobre: round-trip salvar/carregar,
// isolamento por unidade (prefixo de chave), tolerância a JSON corrompido /
// chave ausente (retorna []) e silêncio em erro de escrita (cota/modo privado).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { salvarListaOffline, carregarListaOffline } from '@/lib/offlineList'

const PREFIXO = 'checkflow:offline-list:'

describe('offlineList', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trip: o que salva é o que carrega', () => {
    const lista = [{ id: 'cl1', nome: 'Abertura' }, { id: 'cl2', nome: 'Fechamento' }]
    salvarListaOffline('uni-1', lista)
    expect(carregarListaOffline('uni-1')).toEqual(lista)
  })

  it('grava sob a chave prefixada por unidade', () => {
    salvarListaOffline('uni-1', [{ id: 'x' }])
    expect(localStorage.getItem(PREFIXO + 'uni-1')).toBe(JSON.stringify([{ id: 'x' }]))
  })

  it('isola por unidade — uma unidade não enxerga a lista de outra', () => {
    salvarListaOffline('uni-1', [{ id: 'a' }])
    salvarListaOffline('uni-2', [{ id: 'b' }])
    expect(carregarListaOffline('uni-1')).toEqual([{ id: 'a' }])
    expect(carregarListaOffline('uni-2')).toEqual([{ id: 'b' }])
  })

  it('retorna [] quando não há nada salvo para a unidade', () => {
    expect(carregarListaOffline('inexistente')).toEqual([])
  })

  it('retorna [] (sem lançar) quando o JSON está corrompido', () => {
    localStorage.setItem(PREFIXO + 'uni-1', '{nao é json válido')
    expect(carregarListaOffline('uni-1')).toEqual([])
  })

  it('sobrescreve a lista anterior da mesma unidade', () => {
    salvarListaOffline('uni-1', [{ id: 'velho' }])
    salvarListaOffline('uni-1', [{ id: 'novo' }])
    expect(carregarListaOffline('uni-1')).toEqual([{ id: 'novo' }])
  })

  it('não lança quando o localStorage estoura cota / está indisponível', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => salvarListaOffline('uni-1', [{ id: 'x' }])).not.toThrow()
  })

  it('retorna [] (sem lançar) quando a leitura do localStorage falha', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(carregarListaOffline('uni-1')).toEqual([])
  })
})
