import { describe, it, expect } from 'vitest'
import { validarPadrao, InstanciaInput } from '../../../lib/padrao'

// Validação do cadastro de Padrão (validação combinatória). Cobre as regras de
// consistência aplicadas antes de gravar variáveis/instâncias no banco.
// Fonte única: lib/padrao.ts, importada por app/gestao/padrao/criar/page.tsx.

// Helper: instância com combinação {varId: valorId} e faixa min/max (strings cruas).
function inst(valores: Record<string, string>, min = '', max = ''): InstanciaInput {
  return { valores, valor_min: min, valor_max: max }
}

describe('validarPadrao — dados básicos', () => {
  it('exige nome', () => {
    const r = validarPadrao('   ', ['v1'], [inst({ v1: 'a' }, '1', '2')])
    expect(r).toEqual({ ok: false, erro: 'Informe o nome do padrão.' })
  })

  it('exige ao menos uma variável', () => {
    const r = validarPadrao('Peso', [], [])
    expect(r).toEqual({ ok: false, erro: 'Selecione ao menos uma variável que compõe este padrão.' })
  })

  it('padrão sem nenhuma instância é válido (instâncias são opcionais)', () => {
    expect(validarPadrao('Peso', ['v1'], [])).toEqual({ ok: true })
  })
})

describe('validarPadrao — combinação das instâncias', () => {
  it('aprova quando cada instância tem valor para todas as variáveis', () => {
    const r = validarPadrao('Peso', ['v1', 'v2'], [
      inst({ v1: 'a', v2: 'x' }, '1', '2'),
      inst({ v1: 'a', v2: 'y' }, '3', '4'),
    ])
    expect(r).toEqual({ ok: true })
  })

  it('reprova instância com combinação incompleta', () => {
    const r = validarPadrao('Peso', ['v1', 'v2'], [inst({ v1: 'a' }, '1', '2')])
    expect(r).toEqual({ ok: false, erro: 'Instância #1: escolha um valor para cada variável.' })
  })

  it('aponta o índice (1-based) da instância incompleta', () => {
    const r = validarPadrao('Peso', ['v1'], [
      inst({ v1: 'a' }, '1', '2'),
      inst({ v2: 'b' }, '3', '4'), // falta v1
    ])
    expect(r).toEqual({ ok: false, erro: 'Instância #2: escolha um valor para cada variável.' })
  })

  it('reprova combinações duplicadas', () => {
    const r = validarPadrao('Peso', ['v1', 'v2'], [
      inst({ v1: 'a', v2: 'x' }, '1', '2'),
      inst({ v1: 'a', v2: 'x' }, '3', '4'), // mesma combinação
    ])
    expect(r).toEqual({ ok: false, erro: 'Há instâncias com a mesma combinação de variáveis.' })
  })
})

describe('validarPadrao — faixa numérica [min, max]', () => {
  it('aceita só mínimo', () => {
    expect(validarPadrao('Peso', ['v1'], [inst({ v1: 'a' }, '1', '')])).toEqual({ ok: true })
  })

  it('aceita só máximo', () => {
    expect(validarPadrao('Peso', ['v1'], [inst({ v1: 'a' }, '', '9')])).toEqual({ ok: true })
  })

  it('aceita min = max (valor único)', () => {
    expect(validarPadrao('Peso', ['v1'], [inst({ v1: 'a' }, '10', '10')])).toEqual({ ok: true })
  })

  it('aceita decimais', () => {
    expect(validarPadrao('Peso', ['v1'], [inst({ v1: 'a' }, '1.40', '1.50')])).toEqual({ ok: true })
  })

  it('reprova quando nem min nem max é informado', () => {
    const r = validarPadrao('Peso', ['v1'], [inst({ v1: 'a' }, '', '')])
    expect(r).toEqual({ ok: false, erro: 'Instância #1: informe ao menos o mínimo ou o máximo.' })
  })

  it('reprova valor não numérico', () => {
    const r = validarPadrao('Peso', ['v1'], [inst({ v1: 'a' }, 'abc', '')])
    expect(r).toEqual({ ok: false, erro: 'Instância #1: valores mínimo/máximo devem ser numéricos.' })
  })

  it('reprova min > max', () => {
    const r = validarPadrao('Peso', ['v1'], [inst({ v1: 'a' }, '5', '2')])
    expect(r).toEqual({ ok: false, erro: 'Instância #1: o mínimo não pode ser maior que o máximo.' })
  })

  it('aceita min < max com sinal negativo', () => {
    expect(validarPadrao('Temp', ['v1'], [inst({ v1: 'a' }, '-5', '5')])).toEqual({ ok: true })
  })
})
