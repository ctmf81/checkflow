import { describe, it, expect } from 'vitest'
import {
  percentualUso, faixaAtual, avisosPendentes, fraseLimite,
  type RecursoUso, type UsoRecurso,
} from './avisosUso'

describe('percentualUso()', () => {
  it('considera o extra de pacotes na capacidade', () => {
    expect(percentualUso({ usado: 90, limite: 100, extra: 0 })).toBe(90)
    expect(percentualUso({ usado: 90, limite: 100, extra: 50 })).toBe(60) // 90/150
  })
  it('ilimitado (limite null) → null', () => {
    expect(percentualUso({ usado: 999, limite: null, extra: 0 })).toBeNull()
  })
  it('capacidade zero → null (não divide por zero)', () => {
    expect(percentualUso({ usado: 5, limite: 0, extra: 0 })).toBeNull()
  })
})

describe('faixaAtual()', () => {
  it('abaixo de 80% → null', () => {
    expect(faixaAtual({ usado: 79, limite: 100, extra: 0 })).toBeNull()
  })
  it('80% inclusivo → faixa 80', () => {
    expect(faixaAtual({ usado: 80, limite: 100, extra: 0 })).toBe('80')
    expect(faixaAtual({ usado: 99, limite: 100, extra: 0 })).toBe('80')
  })
  it('100% ou mais → faixa 100 (inclui excedente)', () => {
    expect(faixaAtual({ usado: 100, limite: 100, extra: 0 })).toBe('100')
    expect(faixaAtual({ usado: 130, limite: 100, extra: 0 })).toBe('100')
  })
})

function usos(over: Partial<Record<RecursoUso, UsoRecurso>>): Record<RecursoUso, UsoRecurso> {
  const base: UsoRecurso = { usado: 0, limite: 100, extra: 0 }
  return { execucoes: base, tokens_ia: base, armazenamento: base, ...over }
}

describe('avisosPendentes()', () => {
  const nunca = () => false

  it('gera aviso só para recursos na faixa, com pct arredondado', () => {
    const r = avisosPendentes(usos({
      execucoes: { usado: 85, limite: 100, extra: 0 },
      tokens_ia: { usado: 40, limite: 100, extra: 0 },       // abaixo → sem aviso
      armazenamento: { usado: 200, limite: 100, extra: 0 },  // 100
    }), nunca)
    expect(r).toEqual([
      { recurso: 'execucoes', faixa: '80', pct: 85 },
      { recurso: 'armazenamento', faixa: '100', pct: 200 },
    ])
  })

  it('idempotência: não repete faixa já avisada no período', () => {
    const usado80 = usos({ execucoes: { usado: 85, limite: 100, extra: 0 } })
    const jaAvisou80 = (rec: RecursoUso, faixa: string) => rec === 'execucoes' && faixa === '80'
    expect(avisosPendentes(usado80, jaAvisou80)).toEqual([])
  })

  it('80 já avisado mas agora em 100 → dispara o 100 (faixa nova)', () => {
    const usado100 = usos({ execucoes: { usado: 100, limite: 100, extra: 0 } })
    const jaAvisou80 = (rec: RecursoUso, faixa: string) => rec === 'execucoes' && faixa === '80'
    expect(avisosPendentes(usado100, jaAvisou80)).toEqual([
      { recurso: 'execucoes', faixa: '100', pct: 100 },
    ])
  })

  it('recurso ilimitado nunca gera aviso', () => {
    const r = avisosPendentes(usos({
      execucoes: { usado: 99999, limite: null, extra: 0 },
    }), nunca)
    expect(r).toEqual([])
  })
})

describe('fraseLimite()', () => {
  it('100 fala em atingido; 80 fala em percentual usado', () => {
    expect(fraseLimite('execucoes', '100', 100)).toContain('atingido')
    expect(fraseLimite('armazenamento', '80', 82)).toContain('82%')
  })
})
