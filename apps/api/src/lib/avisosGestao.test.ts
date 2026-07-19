import { describe, it, expect } from 'vitest'
import { deveLembrarPreCadastros, limiteIdadePreCadastro, mensagemWaPreCadastros } from './avisosGestao'

const agora = new Date('2026-07-19T12:00:00Z')

describe('deveLembrarPreCadastros()', () => {
  it('não lembra sem pendentes', () => {
    expect(deveLembrarPreCadastros(0, null, agora)).toBe(false)
  })
  it('lembra na primeira vez (sem envio anterior)', () => {
    expect(deveLembrarPreCadastros(2, null, agora)).toBe(true)
  })
  it('respeita o throttle: não reenvia antes do prazo', () => {
    const ontem = new Date(agora.getTime() - 1 * 86400000).toISOString()
    expect(deveLembrarPreCadastros(2, ontem, agora, 3)).toBe(false)
  })
  it('reenvia depois do throttle', () => {
    const quatroDias = new Date(agora.getTime() - 4 * 86400000).toISOString()
    expect(deveLembrarPreCadastros(2, quatroDias, agora, 3)).toBe(true)
  })
  it('limite exato do throttle conta como elegível (>=)', () => {
    const tresDias = new Date(agora.getTime() - 3 * 86400000).toISOString()
    expect(deveLembrarPreCadastros(1, tresDias, agora, 3)).toBe(true)
  })
})

describe('limiteIdadePreCadastro()', () => {
  it('recua a idade mínima em dias', () => {
    expect(limiteIdadePreCadastro(agora, 1)).toBe('2026-07-18T12:00:00.000Z')
  })
})

describe('mensagemWaPreCadastros()', () => {
  it('singular vs plural', () => {
    expect(mensagemWaPreCadastros('ACME', 1, 'x')).toContain('um pré-cadastro')
    expect(mensagemWaPreCadastros('ACME', 3, 'x')).toContain('3 pré-cadastros')
  })
})
