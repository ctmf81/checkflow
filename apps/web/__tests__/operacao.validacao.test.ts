/**
 * Testes unitários: lógica de validação de atividades (calcularValidacao)
 * Extrai a lógica pura do componente para testar sem renderização.
 */

import { describe, it, expect } from 'vitest'

// ─── Tipos espelhados do componente ──────────────────────────────────────────

interface OpcaoMC {
  id: string; label: string; valor: string; ordem: number; e_valido: boolean
}

interface Atividade {
  id: string; nome: string; tipo: string; obrigatoria: boolean
  config: any; ordem: number; secao_id: string | null
  atividade_pai_id: string | null; valor_gatilho: string | null
  dependentes?: Atividade[]; opcoesMC?: OpcaoMC[]; resposta?: any
}

// ─── Função extraída do componente (deve permanecer sincronizada) ─────────────

function calcularValidacao(atividade: Atividade): boolean | null {
  const val = atividade.resposta
  if (val === null || val === undefined || val === '') return null
  const cfg = atividade.config ?? {}

  if (atividade.tipo === 'sim_nao') {
    if (!cfg.esperado) return null
    return val === cfg.esperado
  }
  if (atividade.tipo === 'numero') {
    const n = Number(val)
    if (isNaN(n)) return null
    if (cfg.min !== null && cfg.min !== undefined && n < cfg.min) return false
    if (cfg.max !== null && cfg.max !== undefined && n > cfg.max) return false
    return true
  }
  if (atividade.tipo === 'multipla_escolha') {
    const opcoes = atividade.opcoesMC ?? []
    if (!opcoes.length) return null
    const selecionados = Array.isArray(val) ? val : [val]
    const temInvalido = selecionados.some(v => {
      const op = opcoes.find(o => o.valor === v || o.label === v)
      return op && !op.e_valido
    })
    return !temInvalido
  }
  return null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function atv(tipo: string, config: any, resposta: any, opcoesMC?: OpcaoMC[]): Atividade {
  return {
    id: 'test', nome: 'Test', tipo, obrigatoria: true,
    config, ordem: 1, secao_id: null, atividade_pai_id: null, valor_gatilho: null,
    resposta, opcoesMC,
  }
}

const opcoes: OpcaoMC[] = [
  { id: '1', label: 'Conforme', valor: 'conforme', ordem: 1, e_valido: true },
  { id: '2', label: 'Não conforme', valor: 'nao_conforme', ordem: 2, e_valido: false },
  { id: '3', label: 'N/A', valor: 'na', ordem: 3, e_valido: true },
]

// ─── sim_nao ─────────────────────────────────────────────────────────────────

describe('sim_nao', () => {
  it('retorna null se sem resposta', () => {
    expect(calcularValidacao(atv('sim_nao', { esperado: 'sim' }, null))).toBe(null)
    expect(calcularValidacao(atv('sim_nao', { esperado: 'sim' }, ''))).toBe(null)
  })
  it('retorna null se sem esperado configurado', () => {
    expect(calcularValidacao(atv('sim_nao', {}, 'sim'))).toBe(null)
  })
  it('conforme quando resposta = esperado', () => {
    expect(calcularValidacao(atv('sim_nao', { esperado: 'sim' }, 'sim'))).toBe(true)
    expect(calcularValidacao(atv('sim_nao', { esperado: 'nao' }, 'nao'))).toBe(true)
  })
  it('não conforme quando resposta ≠ esperado', () => {
    expect(calcularValidacao(atv('sim_nao', { esperado: 'sim' }, 'nao'))).toBe(false)
    expect(calcularValidacao(atv('sim_nao', { esperado: 'nao' }, 'sim'))).toBe(false)
  })
})

// ─── numero ──────────────────────────────────────────────────────────────────

describe('numero', () => {
  it('retorna null se sem resposta', () => {
    expect(calcularValidacao(atv('numero', { min: 0, max: 100 }, null))).toBe(null)
    expect(calcularValidacao(atv('numero', { min: 0, max: 100 }, ''))).toBe(null)
  })
  it('retorna null se valor não é número', () => {
    expect(calcularValidacao(atv('numero', { min: 0, max: 100 }, 'abc'))).toBe(null)
  })
  it('conforme dentro do range', () => {
    expect(calcularValidacao(atv('numero', { min: 0, max: 100 }, '50'))).toBe(true)
    expect(calcularValidacao(atv('numero', { min: 0, max: 100 }, '0'))).toBe(true)
    expect(calcularValidacao(atv('numero', { min: 0, max: 100 }, '100'))).toBe(true)
  })
  it('não conforme abaixo do min', () => {
    expect(calcularValidacao(atv('numero', { min: 10, max: 100 }, '5'))).toBe(false)
    expect(calcularValidacao(atv('numero', { min: 10, max: 100 }, '-1'))).toBe(false)
  })
  it('não conforme acima do max', () => {
    expect(calcularValidacao(atv('numero', { min: 0, max: 50 }, '51'))).toBe(false)
  })
  it('sem min: só valida max', () => {
    expect(calcularValidacao(atv('numero', { min: null, max: 50 }, '30'))).toBe(true)
    expect(calcularValidacao(atv('numero', { min: null, max: 50 }, '51'))).toBe(false)
  })
  it('sem max: só valida min', () => {
    expect(calcularValidacao(atv('numero', { min: 10, max: null }, '100'))).toBe(true)
    expect(calcularValidacao(atv('numero', { min: 10, max: null }, '5'))).toBe(false)
  })
  it('sem nenhum range: sempre conforme se tem resposta', () => {
    expect(calcularValidacao(atv('numero', {}, '999'))).toBe(true)
  })
})

// ─── multipla_escolha ────────────────────────────────────────────────────────

describe('multipla_escolha', () => {
  it('retorna null se sem resposta', () => {
    expect(calcularValidacao(atv('multipla_escolha', {}, null, opcoes))).toBe(null)
  })
  it('retorna null se sem opções carregadas', () => {
    expect(calcularValidacao(atv('multipla_escolha', {}, 'conforme', []))).toBe(null)
  })
  it('conforme se seleção tem e_valido=true', () => {
    expect(calcularValidacao(atv('multipla_escolha', {}, 'conforme', opcoes))).toBe(true)
    expect(calcularValidacao(atv('multipla_escolha', {}, 'na', opcoes))).toBe(true)
  })
  it('não conforme se seleção tem e_valido=false', () => {
    expect(calcularValidacao(atv('multipla_escolha', {}, 'nao_conforme', opcoes))).toBe(false)
  })
  it('múltipla: não conforme se ao menos uma opção selecionada é inválida', () => {
    expect(calcularValidacao(atv('multipla_escolha', { multipla: true }, ['conforme', 'nao_conforme'], opcoes))).toBe(false)
  })
  it('múltipla: conforme se todas válidas', () => {
    expect(calcularValidacao(atv('multipla_escolha', { multipla: true }, ['conforme', 'na'], opcoes))).toBe(true)
  })
})

// ─── tipos sem validação ──────────────────────────────────────────────────────

describe('tipos sem validação automática', () => {
  const tiposSemValidacao = ['foto', 'video', 'localizacao', 'catalogo', 'texto', 'assinatura', 'data_hora']
  tiposSemValidacao.forEach(tipo => {
    it(`${tipo}: sempre retorna null independente da resposta`, () => {
      expect(calcularValidacao(atv(tipo, {}, 'qualquer_valor'))).toBe(null)
      expect(calcularValidacao(atv(tipo, {}, { objeto: true }))).toBe(null)
    })
  })
})
