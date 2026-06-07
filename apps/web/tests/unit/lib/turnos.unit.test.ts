// Testa estaNoTurno() — espelho TS da função SQL usuario_esta_no_turno().
// Cobre os casos descritos no PLANO_DE_TESTES.md seção 8 (Turnos):
// administrativo (com janela cruzando meia-noite), escala (12x36),
// usuário sem turno / turno inativo / sem data de referência.
import { describe, it, expect } from 'vitest'
import { estaNoTurno, type Turno } from '@/lib/turnos'

function dataHora(y: number, m: number, d: number, h: number, min = 0) {
  return new Date(y, m - 1, d, h, min)
}

describe('estaNoTurno — sem turno / inativo', () => {
  it('sem turno cadastrado → sempre true (nunca restringe)', () => {
    expect(estaNoTurno(null)).toBe(true)
    expect(estaNoTurno(undefined)).toBe(true)
  })

  it('turno inativo → tratado como sem turno (sempre true)', () => {
    const turno: Turno = { tipo: 'administrativo', ativo: false, config: { dias: [] } }
    expect(estaNoTurno(turno, dataHora(2026, 6, 8, 10))).toBe(true)
  })
})

describe('estaNoTurno — administrativo', () => {
  // seg-sex 08-17h, sábado 08-11h (exemplo do usuário)
  const turno: Turno = {
    tipo: 'administrativo',
    ativo: true,
    config: {
      dias: [
        { dia: 1, inicio: '08:00', fim: '17:00' }, // segunda
        { dia: 2, inicio: '08:00', fim: '17:00' },
        { dia: 3, inicio: '08:00', fim: '17:00' },
        { dia: 4, inicio: '08:00', fim: '17:00' },
        { dia: 5, inicio: '08:00', fim: '17:00' }, // sexta
        { dia: 6, inicio: '08:00', fim: '11:00' }, // sábado
        // domingo (0) sem janela = nunca está no turno
      ],
    },
  }

  it('dentro da janela em dia de semana → true', () => {
    // 2026-06-08 é uma segunda-feira
    expect(estaNoTurno(turno, dataHora(2026, 6, 8, 9, 30))).toBe(true)
    expect(estaNoTurno(turno, dataHora(2026, 6, 8, 16, 59))).toBe(true)
  })

  it('fora da janela em dia de semana → false', () => {
    expect(estaNoTurno(turno, dataHora(2026, 6, 8, 7, 59))).toBe(false)
    expect(estaNoTurno(turno, dataHora(2026, 6, 8, 17, 0))).toBe(false) // fim é exclusivo
    expect(estaNoTurno(turno, dataHora(2026, 6, 8, 20, 0))).toBe(false)
  })

  it('sábado com janela reduzida (08-11h)', () => {
    // 2026-06-13 é um sábado
    expect(estaNoTurno(turno, dataHora(2026, 6, 13, 9, 0))).toBe(true)
    expect(estaNoTurno(turno, dataHora(2026, 6, 13, 11, 0))).toBe(false)
    expect(estaNoTurno(turno, dataHora(2026, 6, 13, 14, 0))).toBe(false)
  })

  it('domingo sem janela cadastrada → sempre fora do turno', () => {
    // 2026-06-14 é um domingo
    expect(estaNoTurno(turno, dataHora(2026, 6, 14, 10, 0))).toBe(false)
  })

  it('janela que cruza a meia-noite (ex: 22h-06h)', () => {
    const noturno: Turno = {
      tipo: 'administrativo', ativo: true,
      config: { dias: [{ dia: 1, inicio: '22:00', fim: '06:00' }] },
    }
    // segunda 23h → dentro
    expect(estaNoTurno(noturno, dataHora(2026, 6, 8, 23, 0))).toBe(true)
    // segunda 02h → dentro (mesma "noite de segunda" do ponto de vista do dia da semana? Na verdade
    // a função SQL usa extract(dow) do momento — então 02h de segunda É dia=1, e a regra
    // "minutosAgora < fim (06:00)" cobre esse caso)
    expect(estaNoTurno(noturno, dataHora(2026, 6, 8, 2, 0))).toBe(true)
    // segunda 12h → fora
    expect(estaNoTurno(noturno, dataHora(2026, 6, 8, 12, 0))).toBe(false)
  })
})

describe('estaNoTurno — escala (rotativo)', () => {
  // 12x36 começando em 2026-06-01 (segunda) às 06:00
  const turno12x36: Turno = {
    tipo: 'escala',
    ativo: true,
    config: { data_referencia: '2026-06-01', hora_inicio: '06:00', horas_trabalho: 12, horas_folga: 36 },
  }

  it('exatamente no início do ciclo → trabalhando', () => {
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 1, 6, 0))).toBe(true)
  })

  it('no meio do período de trabalho (12h) → trabalhando', () => {
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 1, 12, 0))).toBe(true)
  })

  it('logo após o fim do trabalho (12h após início) → de folga', () => {
    // início 06:00 + 12h trabalho = vira folga às 18:00
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 1, 18, 0))).toBe(false)
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 1, 23, 59))).toBe(false)
  })

  it('no meio da folga (36h) → de folga', () => {
    // folga vai de 18:00 (dia 1) até 06:00 (dia 3) — meio = dia 2, ~12h
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 2, 12, 0))).toBe(false)
  })

  it('na virada do ciclo seguinte (48h após o início) → trabalhando de novo', () => {
    // ciclo = 48h (12 trab + 36 folga); 48h após 01/06 06:00 = 03/06 06:00
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 3, 6, 0))).toBe(true)
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 3, 17, 0))).toBe(true)
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 3, 18, 0))).toBe(false)
  })

  it('vários ciclos à frente continuam corretos (ex: 5 ciclos = 240h)', () => {
    // 240h após 01/06 06:00 = 11/06 06:00 → início de um novo ciclo de trabalho
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 11, 6, 0))).toBe(true)
    expect(estaNoTurno(turno12x36, dataHora(2026, 6, 11, 19, 0))).toBe(false)
  })

  it('momento anterior à data de referência → false (ainda não começou)', () => {
    expect(estaNoTurno(turno12x36, dataHora(2026, 5, 30, 10, 0))).toBe(false)
  })

  it('escala 24x48 calcula com o mesmo motor', () => {
    const turno24x48: Turno = {
      tipo: 'escala', ativo: true,
      config: { data_referencia: '2026-06-01', hora_inicio: '00:00', horas_trabalho: 24, horas_folga: 48 },
    }
    expect(estaNoTurno(turno24x48, dataHora(2026, 6, 1, 12, 0))).toBe(true)  // dentro das 24h de trabalho
    expect(estaNoTurno(turno24x48, dataHora(2026, 6, 2, 12, 0))).toBe(false) // dentro das 48h de folga
    expect(estaNoTurno(turno24x48, dataHora(2026, 6, 4, 0, 0))).toBe(true)   // 72h depois = novo ciclo
  })

  it('sem data_referencia configurada → sempre true (não restringe)', () => {
    const semRef: Turno = { tipo: 'escala', ativo: true, config: { horas_trabalho: 12, horas_folga: 36 } }
    expect(estaNoTurno(semRef, dataHora(2026, 6, 8, 10, 0))).toBe(true)
  })
})
