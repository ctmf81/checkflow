// Testes das regras de fase da assinatura (lib/entitlements/assinaturaFase.ts):
// criação bloqueada pós-trial + estado do AssinaturaGate (banner/bloqueio).
import { describe, it, expect } from 'vitest'
import { podeCriarConteudo, estadoAssinaturaGate } from '@/lib/entitlements/assinaturaFase'

describe('podeCriarConteudo', () => {
  it('só na fase ativa', () => {
    expect(podeCriarConteudo('ativa')).toBe(true)
    expect(podeCriarConteudo('carencia')).toBe(false)
    expect(podeCriarConteudo('bloqueada')).toBe(false)
  })
})

describe('estadoAssinaturaGate', () => {
  it('ainda carregando (pronto=false) → nada, seja qual for a fase', () => {
    expect(estadoAssinaturaGate('bloqueada', false, false)).toEqual({ tipo: 'nada' })
    expect(estadoAssinaturaGate('carencia', true, false)).toEqual({ tipo: 'nada' })
  })

  it('fase ativa → nada', () => {
    expect(estadoAssinaturaGate('ativa', false, true)).toEqual({ tipo: 'nada' })
    expect(estadoAssinaturaGate('ativa', true, true)).toEqual({ tipo: 'nada' })
  })

  it('bloqueada + usuário comum → bloqueio total', () => {
    expect(estadoAssinaturaGate('bloqueada', false, true)).toEqual({ tipo: 'bloqueio_total' })
  })

  it('bloqueada + admin → banner vermelho (não bloqueia a tela)', () => {
    expect(estadoAssinaturaGate('bloqueada', true, true)).toEqual({ tipo: 'banner', bloqueada: true })
  })

  it('carência (qualquer usuário) → banner amarelo', () => {
    expect(estadoAssinaturaGate('carencia', false, true)).toEqual({ tipo: 'banner', bloqueada: false })
    expect(estadoAssinaturaGate('carencia', true, true)).toEqual({ tipo: 'banner', bloqueada: false })
  })
})
