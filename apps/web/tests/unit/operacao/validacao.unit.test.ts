// Testa calcularValidacao() — a regra que decide se uma resposta de
// atividade é "conforme"/"não conforme" (true/false) ou ainda
// indeterminada (null, quando não respondida ou não aplicável).
// Cobre os 3 tipos com validação automática: sim_nao, numero, multipla_escolha.
import { describe, it, expect } from 'vitest'
import { calcularValidacao } from '@/app/operacao/[id]/page'

function atividade(overrides: any) {
  return {
    id: 'a1',
    tipo: 'sim_nao',
    config: {},
    resposta: null,
    opcoesMC: [],
    ...overrides,
  }
}

describe('calcularValidacao — sim_nao', () => {
  it('retorna true quando a resposta bate com o esperado', () => {
    const a = atividade({ tipo: 'sim_nao', config: { esperado: 'sim' }, resposta: 'sim' })
    expect(calcularValidacao(a)).toBe(true)
  })

  it('retorna false quando a resposta diverge do esperado', () => {
    const a = atividade({ tipo: 'sim_nao', config: { esperado: 'sim' }, resposta: 'nao' })
    expect(calcularValidacao(a)).toBe(false)
  })

  it('retorna null quando não há config.esperado', () => {
    const a = atividade({ tipo: 'sim_nao', config: {}, resposta: 'sim' })
    expect(calcularValidacao(a)).toBeNull()
  })

  it('retorna null quando ainda não respondida', () => {
    const a = atividade({ tipo: 'sim_nao', config: { esperado: 'sim' }, resposta: null })
    expect(calcularValidacao(a)).toBeNull()
  })

  it('retorna null quando marcada como não executável', () => {
    const a = atividade({ tipo: 'sim_nao', config: { esperado: 'sim' }, resposta: { _nao_executavel: true, motivo_id: 'm1' } })
    expect(calcularValidacao(a)).toBeNull()
  })
})

describe('calcularValidacao — numero', () => {
  it('conforme quando dentro do range [min, max]', () => {
    const a = atividade({ tipo: 'numero', config: { min: 10, max: 20 }, resposta: '15' })
    expect(calcularValidacao(a)).toBe(true)
  })

  it('não conforme quando abaixo do mínimo', () => {
    const a = atividade({ tipo: 'numero', config: { min: 10, max: 20 }, resposta: '5' })
    expect(calcularValidacao(a)).toBe(false)
  })

  it('não conforme quando acima do máximo', () => {
    const a = atividade({ tipo: 'numero', config: { min: 10, max: 20 }, resposta: '25' })
    expect(calcularValidacao(a)).toBe(false)
  })

  it('limites são inclusivos (min e max contam como conforme)', () => {
    expect(calcularValidacao(atividade({ tipo: 'numero', config: { min: 10, max: 20 }, resposta: '10' }))).toBe(true)
    expect(calcularValidacao(atividade({ tipo: 'numero', config: { min: 10, max: 20 }, resposta: '20' }))).toBe(true)
  })

  it('retorna null para valor não numérico', () => {
    const a = atividade({ tipo: 'numero', config: { min: 10, max: 20 }, resposta: 'abc' })
    expect(calcularValidacao(a)).toBeNull()
  })

  it('conforme quando não há min/max configurados', () => {
    const a = atividade({ tipo: 'numero', config: {}, resposta: '999' })
    expect(calcularValidacao(a)).toBe(true)
  })
})

describe('calcularValidacao — multipla_escolha', () => {
  const opcoes = [
    { valor: 'a', label: 'Opção A', e_valido: true },
    { valor: 'b', label: 'Opção B', e_valido: false },
  ]

  it('conforme quando só seleciona opções válidas', () => {
    const a = atividade({ tipo: 'multipla_escolha', resposta: ['a'], opcoesMC: opcoes })
    expect(calcularValidacao(a)).toBe(true)
  })

  it('não conforme quando seleciona qualquer opção com e_valido=false', () => {
    const a = atividade({ tipo: 'multipla_escolha', resposta: ['a', 'b'], opcoesMC: opcoes })
    expect(calcularValidacao(a)).toBe(false)
  })

  it('não conforme quando a opção selecionada não existe mais (deletada)', () => {
    const a = atividade({ tipo: 'multipla_escolha', resposta: ['removida'], opcoesMC: opcoes })
    expect(calcularValidacao(a)).toBe(false)
  })

  it('aceita resposta única (não array) e avalia igual', () => {
    const a = atividade({ tipo: 'multipla_escolha', resposta: 'b', opcoesMC: opcoes })
    expect(calcularValidacao(a)).toBe(false)
  })

  it('retorna null quando não há opções cadastradas', () => {
    const a = atividade({ tipo: 'multipla_escolha', resposta: ['a'], opcoesMC: [] })
    expect(calcularValidacao(a)).toBeNull()
  })

  it('retorna null quando seleção é array vazio', () => {
    const a = atividade({ tipo: 'multipla_escolha', resposta: [], opcoesMC: opcoes })
    expect(calcularValidacao(a)).toBeNull()
  })
})

describe('calcularValidacao — padrao (combinação de variáveis → faixa min/max)', () => {
  // resposta resolvida pelo CampoPadrao: { numero, instancia_id, valor_min, valor_max }
  function respostaPadrao(overrides: any) {
    return { numero: '10', instancia_id: 'inst-1', valor_min: 5, valor_max: 15, ...overrides }
  }

  it('conforme quando o valor medido está dentro da faixa [min, max]', () => {
    const a = atividade({ tipo: 'padrao', resposta: respostaPadrao({ numero: '10' }) })
    expect(calcularValidacao(a)).toBe(true)
  })

  it('limites são inclusivos', () => {
    expect(calcularValidacao(atividade({ tipo: 'padrao', resposta: respostaPadrao({ numero: '5' }) }))).toBe(true)
    expect(calcularValidacao(atividade({ tipo: 'padrao', resposta: respostaPadrao({ numero: '15' }) }))).toBe(true)
  })

  it('não conforme quando abaixo do mínimo ou acima do máximo', () => {
    expect(calcularValidacao(atividade({ tipo: 'padrao', resposta: respostaPadrao({ numero: '4.9' }) }))).toBe(false)
    expect(calcularValidacao(atividade({ tipo: 'padrao', resposta: respostaPadrao({ numero: '15.1' }) }))).toBe(false)
  })

  it('faixa com só mínimo ou só máximo (o outro lado é null) valida só o lado configurado', () => {
    expect(calcularValidacao(atividade({ tipo: 'padrao', resposta: respostaPadrao({ numero: '1000', valor_min: 5, valor_max: null }) }))).toBe(true)
    expect(calcularValidacao(atividade({ tipo: 'padrao', resposta: respostaPadrao({ numero: '1', valor_min: 5, valor_max: null }) }))).toBe(false)
    expect(calcularValidacao(atividade({ tipo: 'padrao', resposta: respostaPadrao({ numero: '1', valor_min: null, valor_max: 15 }) }))).toBe(true)
  })

  it('retorna null quando não há instância correspondente à combinação escolhida', () => {
    const a = atividade({ tipo: 'padrao', resposta: respostaPadrao({ instancia_id: null, valor_min: null, valor_max: null }) })
    expect(calcularValidacao(a)).toBeNull()
  })

  it('retorna null quando o valor medido não é numérico', () => {
    const a = atividade({ tipo: 'padrao', resposta: respostaPadrao({ numero: 'abc' }) })
    expect(calcularValidacao(a)).toBeNull()
  })

  it('retorna null quando a resposta ainda não tem o formato esperado (objeto)', () => {
    expect(calcularValidacao(atividade({ tipo: 'padrao', resposta: '10' }))).toBeNull()
  })
})

describe('calcularValidacao — tipos sem validação automática', () => {
  it('retorna null para tipos como texto, foto, catalogo etc', () => {
    expect(calcularValidacao(atividade({ tipo: 'texto', resposta: 'qualquer coisa' }))).toBeNull()
    expect(calcularValidacao(atividade({ tipo: 'foto', resposta: 'url-da-foto' }))).toBeNull()
    expect(calcularValidacao(atividade({ tipo: 'catalogo', resposta: { valor_chave: 'x' } }))).toBeNull()
  })
})
