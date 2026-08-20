// Testes das regras de fase da assinatura (lib/entitlements/assinaturaFase.ts):
// criação bloqueada pós-trial + estado do AssinaturaGate (banner).
// Atualizado 2026-08-20: fase 'bloqueada' deixou de existir no SQL — agora só
// 'ativa'|'carencia'. Testes de compat mantidos.
import { describe, it, expect } from 'vitest'
import { podeCriarConteudo, estadoAssinaturaGate } from '@/lib/entitlements/assinaturaFase'

describe('podeCriarConteudo', () => {
  it('só na fase ativa', () => {
    expect(podeCriarConteudo('ativa')).toBe(true)
    expect(podeCriarConteudo('carencia')).toBe(false)
    // Fase legada — se aparecer em dado antigo, bloqueia (fail-closed)
    expect(podeCriarConteudo('bloqueada' as any)).toBe(false)
  })
})

describe('estadoAssinaturaGate', () => {
  it('ainda carregando (pronto=false) → nada, seja qual for a fase', () => {
    expect(estadoAssinaturaGate('carencia', true, false)).toEqual({ tipo: 'nada' })
    expect(estadoAssinaturaGate('bloqueada' as any, false, false)).toEqual({ tipo: 'nada' })
  })

  it('fase ativa → nada', () => {
    expect(estadoAssinaturaGate('ativa', false, true)).toEqual({ tipo: 'nada' })
    expect(estadoAssinaturaGate('ativa', true, true)).toEqual({ tipo: 'nada' })
  })

  it('carência (qualquer usuário) → banner amarelo', () => {
    expect(estadoAssinaturaGate('carencia', false, true)).toEqual({ tipo: 'banner', bloqueada: false })
    expect(estadoAssinaturaGate('carencia', true, true)).toEqual({ tipo: 'banner', bloqueada: false })
  })

  it('fase legada "bloqueada" tratada como carência (compat)', () => {
    expect(estadoAssinaturaGate('bloqueada' as any, false, true)).toEqual({ tipo: 'banner', bloqueada: false })
    expect(estadoAssinaturaGate('bloqueada' as any, true, true)).toEqual({ tipo: 'banner', bloqueada: false })
  })
})
