// Testes da lógica pura dos painéis de Dashboard (lib/painelDados.ts):
// parsing de valor, série + referência (número/padrão), barras por opção e
// tendência da não-conformidade (sim/não e única escolha).
import { describe, it, expect } from 'vitest'
import { num, tendencia, opcoesSimNao, montarLinha, montarBarras, agruparPorDia, serieConformidade, composicaoDiaria, montarPadrao } from '@/lib/painelDados'

const H = 3600_000
const AGORA = Date.parse('2026-07-09T12:00:00.000Z')
const JANELA = 24 * H
// timestamps dentro da janela: t(h) = h horas atrás
const tAtras = (h: number) => new Date(AGORA - h * H).toISOString()

describe('num', () => {
  it('número direto', () => expect(num(23.5)).toBe(23.5))
  it('string numérica', () => expect(num('42')).toBe(42))
  it('objeto padrão usa .numero', () => expect(num({ numero: '7', valor_min: 1 })).toBe(7))
  it('vazio/null/undefined → null', () => {
    expect(num('')).toBeNull(); expect(num(null)).toBeNull(); expect(num(undefined)).toBeNull()
  })
  it('não numérico → null', () => expect(num('abc')).toBeNull())
})

describe('tendencia (não-conformidade 1ª vs 2ª metade)', () => {
  it('estável quando falta ponto numa das metades', () => {
    expect(tendencia([{ t: AGORA - 1 * H, nc: true }], AGORA, JANELA)).toBe('estavel')
  })
  it('alta quando a 2ª metade piora', () => {
    const p = [
      { t: AGORA - 20 * H, nc: false }, { t: AGORA - 18 * H, nc: false },  // 1ª metade: 0%
      { t: AGORA - 6 * H, nc: true }, { t: AGORA - 2 * H, nc: true },       // 2ª metade: 100%
    ]
    expect(tendencia(p, AGORA, JANELA)).toBe('alta')
  })
  it('queda quando a 2ª metade melhora', () => {
    const p = [
      { t: AGORA - 20 * H, nc: true }, { t: AGORA - 18 * H, nc: true },     // 1ª: 100%
      { t: AGORA - 6 * H, nc: false }, { t: AGORA - 2 * H, nc: false },     // 2ª: 0%
    ]
    expect(tendencia(p, AGORA, JANELA)).toBe('queda')
  })
  it('estável quando a diferença é pequena (< 5pp)', () => {
    // 1ª metade 0/10, 2ª metade 0/10 → 0 diff
    const p = [...Array(10)].map((_, i) => ({ t: AGORA - (20 - i * 0.1) * H, nc: false }))
      .concat([...Array(10)].map((_, i) => ({ t: AGORA - (6 - i * 0.1) * H, nc: false })))
    expect(tendencia(p, AGORA, JANELA)).toBe('estavel')
  })
})

describe('opcoesSimNao', () => {
  it('esperado sim → "sim" válido, "nao" inválido', () => {
    const o = opcoesSimNao('sim')
    expect(o.find(x => x.valor === 'sim')!.e_valido).toBe(true)
    expect(o.find(x => x.valor === 'nao')!.e_valido).toBe(false)
  })
  it('sem esperado → ambos válidos', () => {
    const o = opcoesSimNao(null)
    expect(o.every(x => x.e_valido)).toBe(true)
  })
})

describe('montarLinha (número/padrão)', () => {
  it('número: série filtra não-numéricos e ref vem do config', () => {
    const rs = [
      { resposta: '10', criado_em: tAtras(3) },
      { resposta: 'abc', criado_em: tAtras(2) }, // ignorado
      { resposta: 30, criado_em: tAtras(1) },
    ]
    const r = montarLinha(rs, 'numero', { min: 20, max: 100, unidade: '°C' })
    expect(r.serie.map(p => p.v)).toEqual([10, 30])
    expect(r.ref).toEqual({ min: 20, max: 100 })
    expect(r.unidade).toBe('°C')
    expect(r.total).toBe(2)
  })
  it('padrão: ref vem da resposta mais recente com faixa', () => {
    const rs = [
      { resposta: { numero: 5, valor_min: 0, valor_max: 8 }, criado_em: tAtras(3) },
      { resposta: { numero: 6, valor_min: 2, valor_max: 9 }, criado_em: tAtras(1) },
    ]
    const r = montarLinha(rs, 'padrao', {})
    expect(r.ref).toEqual({ min: 2, max: 9 })
    expect(r.serie.map(p => p.v)).toEqual([5, 6])
  })
})

describe('montarBarras (sim/não, única escolha)', () => {
  it('conta por opção, marca não-conformes e calcula tendência', () => {
    const rs = [
      { resposta: 'nao', criado_em: tAtras(20) }, // 1ª metade, não-conforme (esperado sim)
      { resposta: 'sim', criado_em: tAtras(18) },
      { resposta: 'nao', criado_em: tAtras(4) },  // 2ª metade
      { resposta: 'nao', criado_em: tAtras(2) },
    ]
    const r = montarBarras(rs, opcoesSimNao('sim'), AGORA, JANELA)
    expect(r.total).toBe(4)
    expect(r.barras.find(b => b.label === 'Sim')!.count).toBe(1)
    expect(r.barras.find(b => b.label === 'Não')!.count).toBe(3)
    expect(r.naoConformes).toBe(3)           // três "nao" com esperado "sim"
    expect(r.tendencia).toBe('alta')          // não-conformidade sobe na 2ª metade
  })
  it('ignora respostas nulas/objeto/array-vazio no total', () => {
    const rs = [
      { resposta: null, criado_em: tAtras(1) },
      { resposta: { x: 1 }, criado_em: tAtras(1) },
      { resposta: 'sim', criado_em: tAtras(1) },
    ]
    const r = montarBarras(rs, opcoesSimNao('sim'), AGORA, JANELA)
    expect(r.total).toBe(1)
  })
})

describe('agruparPorDia', () => {
  it('agrupa por dia UTC em ordem cronológica', () => {
    const rs = [
      { resposta: 'a', criado_em: '2026-07-08T10:00:00Z' },
      { resposta: 'b', criado_em: '2026-07-09T09:00:00Z' },
      { resposta: 'c', criado_em: '2026-07-08T22:00:00Z' },
    ]
    const g = agruparPorDia(rs)
    expect(g.map(d => d.dia)).toEqual(['2026-07-08', '2026-07-09'])
    expect(g[0].itens.length).toBe(2)
  })
})

describe('serieConformidade (sim/não por dia)', () => {
  it('% conforme por dia (esperado sim)', () => {
    const rs = [
      { resposta: 'sim', criado_em: '2026-07-08T08:00:00Z' },
      { resposta: 'nao', criado_em: '2026-07-08T12:00:00Z' },
      { resposta: 'sim', criado_em: '2026-07-09T08:00:00Z' },
      { resposta: 'sim', criado_em: '2026-07-09T12:00:00Z' },
    ]
    const s = serieConformidade(rs, opcoesSimNao('sim'))
    expect(s).toEqual([
      { dia: '2026-07-08', total: 2, conformes: 1, pct: 50 },
      { dia: '2026-07-09', total: 2, conformes: 2, pct: 100 },
    ])
  })
})

describe('composicaoDiaria (única escolha por dia)', () => {
  it('conta por opção por dia, mantendo a ordem das opções', () => {
    const opcoes = [
      { valor: 'otimo', label: 'Ótimo', e_valido: true },
      { valor: 'ruim', label: 'Ruim', e_valido: false },
    ]
    const rs = [
      { resposta: 'otimo', criado_em: '2026-07-08T08:00:00Z' },
      { resposta: 'ruim', criado_em: '2026-07-08T12:00:00Z' },
      { resposta: 'otimo', criado_em: '2026-07-08T16:00:00Z' },
    ]
    const c = composicaoDiaria(rs, opcoes)
    expect(c.length).toBe(1)
    expect(c[0].total).toBe(3)
    expect(c[0].seg).toEqual([
      { valor: 'otimo', label: 'Ótimo', conforme: true, count: 2 },
      { valor: 'ruim', label: 'Ruim', conforme: false, count: 1 },
    ])
  })
})

describe('montarPadrao (faixa varia por ponto)', () => {
  it('ribbon quando a faixa é única na janela', () => {
    const rs = [
      { resposta: { numero: 5, valor_min: 0, valor_max: 8 }, criado_em: tAtras(3) },
      { resposta: { numero: 9, valor_min: 0, valor_max: 8 }, criado_em: tAtras(1) }, // fora
    ]
    const r = montarPadrao(rs)
    expect(r.modo).toBe('ribbon')
    expect(r.total).toBe(2)
    expect(r.fora).toBe(1)
  })
  it('índice normalizado quando as faixas diferem (0=centro, ±100=borda)', () => {
    const rs = [
      { resposta: { numero: 5, valor_min: 0, valor_max: 10 }, criado_em: tAtras(3) },  // centro → 0
      { resposta: { numero: 12, valor_min: 0, valor_max: 8 }, criado_em: tAtras(2) },  // acima da borda → >100
      { resposta: { numero: 3, valor_min: 2, valor_max: 4 }, criado_em: tAtras(1) },   // centro → 0
    ]
    const r = montarPadrao(rs) as Extract<ReturnType<typeof montarPadrao>, { modo: 'indice' }>
    expect(r.modo).toBe('indice')
    const idxs = r.serie.map(s => s.idx)
    expect(idxs[0]).toBe(0)
    expect(idxs[1]).toBeGreaterThan(100)
    expect(r.fora).toBe(1)
  })
})
