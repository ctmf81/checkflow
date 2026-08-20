import { describe, it, expect } from 'vitest'
import { podeCriarConteudo, estadoAssinaturaGate, MSG_CRIACAO_BLOQUEADA } from './assinaturaFase'

describe('podeCriarConteudo', () => {
  it('libera só na fase ativa', () => {
    expect(podeCriarConteudo('ativa')).toBe(true)
    expect(podeCriarConteudo('carencia')).toBe(false)
    expect(podeCriarConteudo('bloqueada')).toBe(false)
  })

  it('fase desconhecida bloqueia (fail-closed)', () => {
    expect(podeCriarConteudo('desconhecida' as any)).toBe(false)
    expect(podeCriarConteudo('' as any)).toBe(false)
  })

  it('MSG_CRIACAO_BLOQUEADA existe e não é vazia', () => {
    expect(MSG_CRIACAO_BLOQUEADA.length).toBeGreaterThan(0)
  })
})

describe('estadoAssinaturaGate', () => {
  it('nada se ainda não pronto', () => {
    expect(estadoAssinaturaGate('bloqueada', false, false)).toEqual({ tipo: 'nada' })
  })

  it('nada se fase ativa (independe de admin)', () => {
    expect(estadoAssinaturaGate('ativa', false, true)).toEqual({ tipo: 'nada' })
    expect(estadoAssinaturaGate('ativa', true, true)).toEqual({ tipo: 'nada' })
  })

  it('bloqueada + não-admin → tela cheia', () => {
    expect(estadoAssinaturaGate('bloqueada', false, true)).toEqual({ tipo: 'bloqueio_total' })
  })

  it('bloqueada + admin → só banner (permite ir a /gestao/plano regularizar)', () => {
    expect(estadoAssinaturaGate('bloqueada', true, true)).toEqual({ tipo: 'banner', bloqueada: true })
  })

  it('carencia → banner amarelo pra todos', () => {
    expect(estadoAssinaturaGate('carencia', false, true)).toEqual({ tipo: 'banner', bloqueada: false })
    expect(estadoAssinaturaGate('carencia', true, true)).toEqual({ tipo: 'banner', bloqueada: false })
  })
})
