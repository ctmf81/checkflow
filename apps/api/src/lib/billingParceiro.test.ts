import { describe, it, expect } from 'vitest'
import {
  montarSplit, vencimentoAncora, dataCorteCarencia, cortaAcessoPorInadimplencia,
  calcularProRata, PISO_PRO_RATA_UPGRADE,
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

describe('calcularProRata', () => {
  const base = {
    valorAtual: 50, valorNovo: 100,
    cicloAtual: 'mensal' as const, cicloNovo: 'mensal' as const,
    periodoFim: '2026-08-31', hoje: '2026-08-16',
  }

  it('upgrade mensal com 15 dias restantes cobra metade da diferença', () => {
    const r = calcularProRata(base)
    expect(r).toEqual({ valor: 25, diasRestantes: 15, diasCicloTotal: 30 })
  })

  it('upgrade anual usa base de 365 dias', () => {
    const r = calcularProRata({
      ...base, cicloAtual: 'anual', cicloNovo: 'anual',
      valorAtual: 500, valorNovo: 1000, periodoFim: '2026-11-15', hoje: '2026-08-16',
    })
    expect(r).not.toBeNull()
    expect(r!.diasCicloTotal).toBe(365)
    expect(r!.diasRestantes).toBe(91)
    expect(r!.valor).toBeCloseTo(500 * (91 / 365), 2)
  })

  it('downgrade retorna null (não cobra crédito/refund)', () => {
    expect(calcularProRata({ ...base, valorAtual: 100, valorNovo: 50 })).toBeNull()
  })

  it('plano igual retorna null', () => {
    expect(calcularProRata({ ...base, valorAtual: 100, valorNovo: 100 })).toBeNull()
  })

  it('cross-cycle (mensal→anual) retorna null — mantém agendado', () => {
    expect(calcularProRata({ ...base, cicloAtual: 'mensal', cicloNovo: 'anual' })).toBeNull()
    expect(calcularProRata({ ...base, cicloAtual: 'anual', cicloNovo: 'mensal' })).toBeNull()
  })

  it('período já expirado retorna null', () => {
    expect(calcularProRata({ ...base, periodoFim: '2026-08-16' })).toBeNull()
    expect(calcularProRata({ ...base, periodoFim: '2026-08-10' })).toBeNull()
  })

  it('valor abaixo do piso R$ 1 retorna null (evita fatura de centavos)', () => {
    // upgrade R$1 diferença × 1 dia / 30 = R$0,03 → pula
    expect(calcularProRata({
      ...base, valorAtual: 100, valorNovo: 101, periodoFim: '2026-08-17',
    })).toBeNull()
  })

  it('piso customizável', () => {
    // R$25 acima do padrão R$1 (passa), mas rejeita se piso for R$30
    expect(calcularProRata(base)).not.toBeNull()
    expect(calcularProRata({ ...base, piso: 30 })).toBeNull()
  })

  it('arredonda para 2 casas decimais (evita frações de centavo)', () => {
    // 33.33... × 15/30 = 16.6666... → 16.67
    const r = calcularProRata({ ...base, valorNovo: 50 + 33.33 })
    expect(r!.valor).toBe(16.67)
  })

  it('piso padrão exposto', () => {
    expect(PISO_PRO_RATA_UPGRADE).toBe(1)
  })
})
