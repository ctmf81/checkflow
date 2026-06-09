/**
 * Testes unitários para a lógica de SLA de tickets.
 *
 * Os triggers de SLA vivem em Postgres (migration 20260609000001_tickets.sql)
 * e não podem ser testados sem banco. Este arquivo espelha a mesma matemática
 * em TypeScript puro e garante que a lógica está correta.
 *
 * MANTENHA EM SINCRONIA com:
 *   - tickets_set_sla()          → calcularDeadline()
 *   - tickets_gerenciar_sla_pausa() → calcularSegundosRestantes()
 *
 * Se a lógica SQL mudar, atualize as funções abaixo e os testes.
 */

import { describe, it, expect } from 'vitest'

// ─── Espelhos das funções Postgres ────────────────────────────────────────────

/**
 * Calcula o deadline de SLA a partir do momento de criação.
 * Espelha tickets_set_sla() — retorna null se não houver config.
 */
function calcularDeadline(
  criadoEm: Date,
  tempoResolucaoMin: number | null
): Date | null {
  if (tempoResolucaoMin == null) return null
  return new Date(criadoEm.getTime() + tempoResolucaoMin * 60 * 1000)
}

/**
 * Calcula segundos restantes de SLA descontando pausas acumuladas.
 * Espelha a matemática de tickets_gerenciar_sla_pausa() + consulta do frontend.
 *
 * @param deadline         - sla_deadline_at
 * @param segundosPausados - sla_segundos_pausados acumulado
 * @param pausadoEm        - sla_pausado_em (timestamp quando entrou em pausa, null = ativo)
 * @param agora            - momento de referência (default: Date.now())
 */
function calcularSegundosRestantes(
  deadline: Date,
  segundosPausados: number,
  pausadoEm: Date | null,
  agora: Date = new Date()
): number {
  // Se estiver pausado agora, acumula o tempo atual de pausa também
  const pausaAtual = pausadoEm
    ? Math.floor((agora.getTime() - pausadoEm.getTime()) / 1000)
    : 0

  const totalPausados = segundosPausados + pausaAtual
  const deadlineAjustado = new Date(deadline.getTime() + totalPausados * 1000)
  return Math.floor((deadlineAjustado.getTime() - agora.getTime()) / 1000)
}

/**
 * Semáforo de SLA: cor baseada em % do tempo restante.
 * Espelha a lógica visual do frontend (tickets/page.tsx).
 *
 * > 50% restante → verde
 * 10–50%         → amarelo
 * < 10%          → vermelho
 * vencido        → vermelho
 */
function semaforo(segundosRestantes: number, tempoTotalMin: number): 'verde' | 'amarelo' | 'vermelho' {
  if (tempoTotalMin <= 0) return 'verde'
  const totalSeg = tempoTotalMin * 60
  const pct = segundosRestantes / totalSeg
  if (segundosRestantes <= 0) return 'vermelho'
  if (pct > 0.5) return 'verde'
  if (pct >= 0.1) return 'amarelo'
  return 'vermelho'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutosAtras(min: number, ref: Date = new Date()): Date {
  return new Date(ref.getTime() - min * 60 * 1000)
}
function minutosAFrente(min: number, ref: Date = new Date()): Date {
  return new Date(ref.getTime() + min * 60 * 1000)
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('calcularDeadline() — tickets_set_sla()', () => {

  it('sem config de SLA → retorna null', () => {
    expect(calcularDeadline(new Date(), null)).toBeNull()
  })

  it('480 min (8h) → deadline = criadoEm + 8h', () => {
    const criado = new Date('2026-01-01T08:00:00Z')
    const deadline = calcularDeadline(criado, 480)
    expect(deadline?.toISOString()).toBe('2026-01-01T16:00:00.000Z')
  })

  it('60 min (1h) → deadline correto', () => {
    const criado = new Date('2026-01-01T10:30:00Z')
    const deadline = calcularDeadline(criado, 60)
    expect(deadline?.toISOString()).toBe('2026-01-01T11:30:00.000Z')
  })

  it('0 minutos → deadline = criadoEm (imediato)', () => {
    const criado = new Date('2026-01-01T10:00:00Z')
    expect(calcularDeadline(criado, 0)?.getTime()).toBe(criado.getTime())
  })
})

describe('calcularSegundosRestantes() — lógica de pausa', () => {

  it('sem pausa — ticket dentro do SLA — retorna segundos positivos', () => {
    const agora = new Date('2026-01-01T10:00:00Z')
    const deadline = minutosAFrente(120, agora)   // vence em 2h
    const restantes = calcularSegundosRestantes(deadline, 0, null, agora)
    expect(restantes).toBe(120 * 60)
  })

  it('sem pausa — ticket vencido — retorna segundos negativos', () => {
    const agora = new Date('2026-01-01T10:00:00Z')
    const deadline = minutosAtras(30, agora)   // venceu há 30 min
    const restantes = calcularSegundosRestantes(deadline, 0, null, agora)
    expect(restantes).toBe(-30 * 60)
  })

  it('com pausa acumulada — desconta do tempo total consumido', () => {
    const agora = new Date('2026-01-01T12:00:00Z')
    // deadline original em 10h, já passaram 4h → restam 6h
    // mas ficou 1h pausado → desconta: restam 6h + 1h = 7h
    const deadline = new Date('2026-01-01T14:00:00Z')  // 2h à frente
    const restantes = calcularSegundosRestantes(deadline, 60 * 60, null, agora) // 1h pausada
    expect(restantes).toBe((2 + 1) * 60 * 60)  // 3h
  })

  it('pausado agora — acumula tempo de pausa corrente', () => {
    const agora = new Date('2026-01-01T12:00:00Z')
    const pausadoEm = minutosAtras(30, agora)    // pausou há 30 min
    const deadline = minutosAFrente(60, agora)   // vence em 1h
    // pausa atual = 30 min; restam 1h + 30 min = 90 min
    const restantes = calcularSegundosRestantes(deadline, 0, pausadoEm, agora)
    expect(restantes).toBe(90 * 60)
  })

  it('pausado há muito tempo — SLA não vence enquanto pausado', () => {
    const agora = new Date('2026-01-01T12:00:00Z')
    const pausadoEm = minutosAtras(120, agora)   // pausou há 2h
    const deadline = minutosAtras(60, agora)     // sem pausa já teria vencido há 1h
    // pausa atual = 2h → ajuste: deadline + 2h → agora+1h → ainda dentro do SLA
    const restantes = calcularSegundosRestantes(deadline, 0, pausadoEm, agora)
    expect(restantes).toBe(60 * 60)  // 1h restante
  })

  it('pausa acumulada + pausa ativa combinadas', () => {
    const agora = new Date('2026-01-01T12:00:00Z')
    const pausadoEm = minutosAtras(15, agora)    // pausou há 15 min agora
    const deadline = minutosAFrente(30, agora)   // vence em 30 min
    // pausa acumulada: 45 min, pausa ativa: 15 min → total 60 min de pausa
    const restantes = calcularSegundosRestantes(deadline, 45 * 60, pausadoEm, agora)
    expect(restantes).toBe((30 + 60) * 60)  // 90 min
  })
})

describe('semaforo() — status visual do SLA', () => {

  it('> 50% restante → verde', () => {
    // 480 min total, 300 min restantes (62.5%)
    expect(semaforo(300 * 60, 480)).toBe('verde')
  })

  it('exatamente 50% → amarelo (não é > 50%)', () => {
    expect(semaforo(240 * 60, 480)).toBe('amarelo')
  })

  it('entre 10% e 50% → amarelo', () => {
    // 480 min total, 100 min restantes (~20.8%)
    expect(semaforo(100 * 60, 480)).toBe('amarelo')
  })

  it('exatamente 10% → amarelo (limite inclusivo)', () => {
    // 480 min total, 48 min restantes (10%)
    expect(semaforo(48 * 60, 480)).toBe('amarelo')
  })

  it('< 10% → vermelho', () => {
    // 480 min total, 40 min restantes (8.3%)
    expect(semaforo(40 * 60, 480)).toBe('vermelho')
  })

  it('0 segundos (exatamente no limite) → vermelho', () => {
    expect(semaforo(0, 480)).toBe('vermelho')
  })

  it('vencido (negativo) → vermelho', () => {
    expect(semaforo(-600, 480)).toBe('vermelho')
  })

  it('tempoTotal = 0 → verde (sem config de SLA)', () => {
    expect(semaforo(0, 0)).toBe('verde')
  })
})

describe('fluxo completo — ticket crítico (SLA 60 min)', () => {

  it('criado → em tratamento → pausado → retomado → vence corretamente', () => {
    const T0 = new Date('2026-01-01T08:00:00Z')

    // 1. Ticket criado — deadline em 1h
    const deadline = calcularDeadline(T0, 60)!
    expect(deadline.toISOString()).toBe('2026-01-01T09:00:00.000Z')

    // 2. Após 20 min (T0+20): semáforo verde (66% restante)
    const T20 = minutosAFrente(20, T0)
    const rest20 = calcularSegundosRestantes(deadline, 0, null, T20)
    expect(semaforo(rest20, 60)).toBe('verde')

    // 3. Entra em pausa no T0+20; retoma no T0+35 (pausa de 15 min)
    const pausadoEm = T20
    const T35 = minutosAFrente(35, T0)
    const segundosPausados = Math.floor((T35.getTime() - pausadoEm.getTime()) / 1000)
    expect(segundosPausados).toBe(15 * 60)

    // 4. T0+50 (10 min depois de retomar): ainda tem 10+15=25 min → verde/amarelo?
    const T50 = minutosAFrente(50, T0)
    const rest50 = calcularSegundosRestantes(deadline, segundosPausados, null, T50)
    // Sem pausa: restam 10 min (16.6%) → amarelo
    // Com pausa de 15 min: restam 25 min (41.6%) → ainda amarelo
    expect(rest50).toBe(25 * 60)
    expect(semaforo(rest50, 60)).toBe('amarelo')

    // 5. T0+65 (5 min após deadline original): sem pausa estaria vencido,
    //    mas com 15 min de pausa ainda restam 10 min → amarelo
    const T65 = minutosAFrente(65, T0)
    const rest65 = calcularSegundosRestantes(deadline, segundosPausados, null, T65)
    expect(rest65).toBe(10 * 60)
    expect(semaforo(rest65, 60)).toBe('amarelo')

    // 6. T0+76: SLA vencido (restam -1 min)
    const T76 = minutosAFrente(76, T0)
    const rest76 = calcularSegundosRestantes(deadline, segundosPausados, null, T76)
    expect(rest76).toBe(-1 * 60)
    expect(semaforo(rest76, 60)).toBe('vermelho')
  })
})
