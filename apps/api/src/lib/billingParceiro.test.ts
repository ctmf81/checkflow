import { describe, it, expect } from 'vitest'
import {
  montarSplit, vencimentoAncora, dataCorteCarencia, cortaAcessoPorInadimplencia,
  DIAS_CARENCIA_INADIMPLENCIA,
} from './billingParceiro'

describe('montarSplit', () => {
  const ok = { percentual: 10, walletId: 'wal_123', statusParceiro: 'ativo' }

  it('monta o split com parceiro ativo, wallet e percentual', () => {
    expect(montarSplit(ok)).toEqual([{ walletId: 'wal_123', percentualValue: 10 }])
  })

  it('aceita percentual vindo como string (numeric do Postgres)', () => {
    expect(montarSplit({ ...ok, percentual: '7.5' })).toEqual([{ walletId: 'wal_123', percentualValue: 7.5 }])
  })

  // Fallback seguro: na dúvida, cobra 100% CheckFlow em vez de repassar errado.
  it('não faz split sem wallet', () => {
    expect(montarSplit({ ...ok, walletId: null })).toBeUndefined()
    expect(montarSplit({ ...ok, walletId: '   ' })).toBeUndefined()
  })

  it('não faz split com parceiro inativo', () => {
    expect(montarSplit({ ...ok, statusParceiro: 'inativo' })).toBeUndefined()
  })

  it('não faz split com percentual zero, nulo ou negativo', () => {
    expect(montarSplit({ ...ok, percentual: 0 })).toBeUndefined()
    expect(montarSplit({ ...ok, percentual: null })).toBeUndefined()
    expect(montarSplit({ ...ok, percentual: -5 })).toBeUndefined()
    expect(montarSplit({ ...ok, percentual: 'abc' })).toBeUndefined()
  })
})

describe('vencimentoAncora', () => {
  it('guarda o vencimento mais antigo (prazo não reinicia a cada fatura)', () => {
    expect(vencimentoAncora('2026-07-10', '2026-08-10')).toBe('2026-07-10')
    expect(vencimentoAncora('2026-08-10', '2026-07-10')).toBe('2026-07-10')
  })

  it('usa o novo quando ainda não havia âncora', () => {
    expect(vencimentoAncora(null, '2026-07-10')).toBe('2026-07-10')
  })

  it('preserva a âncora quando o evento vem sem vencimento', () => {
    expect(vencimentoAncora('2026-07-10', null)).toBe('2026-07-10')
  })

  it('devolve null quando não há nenhuma data', () => {
    expect(vencimentoAncora(null, undefined)).toBeNull()
  })
})

describe('dataCorteCarencia', () => {
  it('soma os 7 dias de tolerância', () => {
    expect(dataCorteCarencia('2026-07-10')).toBe('2026-07-17')
  })

  it('atravessa virada de mês e ano', () => {
    expect(dataCorteCarencia('2026-07-28')).toBe('2026-08-04')
    expect(dataCorteCarencia('2026-12-30')).toBe('2027-01-06')
  })

  it('aceita prazo customizado', () => {
    expect(dataCorteCarencia('2026-07-10', 3)).toBe('2026-07-13')
  })
})

describe('cortaAcessoPorInadimplencia', () => {
  const base = { planoTipo: 'pago', status: 'inadimplente', vencidoEm: '2026-07-10' }

  it('não corta durante a tolerância', () => {
    expect(cortaAcessoPorInadimplencia({ ...base, hoje: '2026-07-11' })).toBe(false)
  })

  // Fronteira: no último dia da carência ainda opera; corta só no dia seguinte.
  it('não corta no 7º dia, corta no 8º', () => {
    expect(cortaAcessoPorInadimplencia({ ...base, hoje: '2026-07-17' })).toBe(false)
    expect(cortaAcessoPorInadimplencia({ ...base, hoje: '2026-07-18' })).toBe(true)
  })

  it('só vale para plano pago', () => {
    expect(cortaAcessoPorInadimplencia({ ...base, planoTipo: 'cortesia', hoje: '2026-07-30' })).toBe(false)
    expect(cortaAcessoPorInadimplencia({ ...base, planoTipo: 'trial', hoje: '2026-07-30' })).toBe(false)
  })

  it('só vale com status inadimplente (pagou = volta a operar)', () => {
    expect(cortaAcessoPorInadimplencia({ ...base, status: 'ativo', hoje: '2026-07-30' })).toBe(false)
  })

  it('sem âncora de vencimento, não corta', () => {
    expect(cortaAcessoPorInadimplencia({ ...base, vencidoEm: null, hoje: '2026-07-30' })).toBe(false)
  })

  it('a tolerância documentada é de 7 dias', () => {
    expect(DIAS_CARENCIA_INADIMPLENCIA).toBe(7)
  })
})
