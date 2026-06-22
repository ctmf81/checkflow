// Testa os modos de comportamento fora do turno — espelhos TS das funções SQL
// usuario_recebe_notificacao / usuario_pode_acessar / usuario_deve_avisar_turno
// (migration 20260622120000_turno_modo_fora.sql).
import { describe, it, expect } from 'vitest'
import { recebeNotificacao, podeAcessar, deveAvisar, type Turno, type ModoForaTurno } from '@/lib/turnos'

function dataHora(y: number, m: number, d: number, h: number, min = 0) {
  return new Date(y, m - 1, d, h, min)
}

// Administrativo seg-sex 08-17h. modo configurável.
function turnoAdmin(modo: ModoForaTurno): Turno {
  return {
    tipo: 'administrativo',
    ativo: true,
    modo_fora_turno: modo,
    config: { dias: [1, 2, 3, 4, 5].map(dia => ({ dia, inicio: '08:00', fim: '17:00' })) },
  }
}

const DENTRO = dataHora(2026, 6, 8, 10) // segunda 10h
const FORA = dataHora(2026, 6, 8, 20)   // segunda 20h

describe('recebeNotificacao', () => {
  it('sem turno / inativo → sempre recebe', () => {
    expect(recebeNotificacao(null, FORA)).toBe(true)
    expect(recebeNotificacao({ ...turnoAdmin('notificacao'), ativo: false }, FORA)).toBe(true)
  })

  it('modo notificacao + fora do turno → NÃO recebe', () => {
    expect(recebeNotificacao(turnoAdmin('notificacao'), FORA)).toBe(false)
  })

  it('modo notificacao + dentro do turno → recebe', () => {
    expect(recebeNotificacao(turnoAdmin('notificacao'), DENTRO)).toBe(true)
  })

  it('modos login/aviso não suprimem notificação, mesmo fora', () => {
    expect(recebeNotificacao(turnoAdmin('login'), FORA)).toBe(true)
    expect(recebeNotificacao(turnoAdmin('aviso'), FORA)).toBe(true)
  })

  it('turno sem modo definido → trata como notificacao (default)', () => {
    const t: Turno = { ...turnoAdmin('notificacao'), modo_fora_turno: undefined }
    expect(recebeNotificacao(t, FORA)).toBe(false)
  })
})

describe('podeAcessar', () => {
  it('sem turno / inativo → sempre pode', () => {
    expect(podeAcessar(null, FORA)).toBe(true)
    expect(podeAcessar({ ...turnoAdmin('login'), ativo: false }, FORA)).toBe(true)
  })

  it('modo login + fora do turno + não-admin → NÃO pode', () => {
    expect(podeAcessar(turnoAdmin('login'), FORA, false)).toBe(false)
  })

  it('modo login + fora do turno + admin → pode (isento)', () => {
    expect(podeAcessar(turnoAdmin('login'), FORA, true)).toBe(true)
  })

  it('modo login + dentro do turno → pode', () => {
    expect(podeAcessar(turnoAdmin('login'), DENTRO, false)).toBe(true)
  })

  it('modos notificacao/aviso nunca bloqueiam acesso, mesmo fora', () => {
    expect(podeAcessar(turnoAdmin('notificacao'), FORA, false)).toBe(true)
    expect(podeAcessar(turnoAdmin('aviso'), FORA, false)).toBe(true)
  })
})

describe('deveAvisar', () => {
  it('sem turno / inativo → não avisa', () => {
    expect(deveAvisar(null, FORA)).toBe(false)
    expect(deveAvisar({ ...turnoAdmin('aviso'), ativo: false }, FORA)).toBe(false)
  })

  it('modo aviso + fora do turno → avisa', () => {
    expect(deveAvisar(turnoAdmin('aviso'), FORA)).toBe(true)
  })

  it('modo aviso + dentro do turno → não avisa', () => {
    expect(deveAvisar(turnoAdmin('aviso'), DENTRO)).toBe(false)
  })

  it('modos notificacao/login nunca avisam', () => {
    expect(deveAvisar(turnoAdmin('notificacao'), FORA)).toBe(false)
    expect(deveAvisar(turnoAdmin('login'), FORA)).toBe(false)
  })
})
