import { describe, it, expect } from 'vitest'
import { criarRateLimiter } from './rateLimit'

describe('criarRateLimiter', () => {
  it('permite até o limite dentro da janela', () => {
    const rl = criarRateLimiter({ janelaMs: 60_000, max: 3 })
    const t = 1000
    expect(rl.ok('ip1', t)).toBe(true)
    expect(rl.ok('ip1', t + 100)).toBe(true)
    expect(rl.ok('ip1', t + 200)).toBe(true)
    expect(rl.ok('ip1', t + 300)).toBe(false) // 4ª bloqueia
  })

  it('libera após a janela passar (desliza)', () => {
    const rl = criarRateLimiter({ janelaMs: 1_000, max: 2 })
    expect(rl.ok('ip1', 0)).toBe(true)
    expect(rl.ok('ip1', 500)).toBe(true)
    expect(rl.ok('ip1', 900)).toBe(false)
    // aos 1500ms: registros em 0 e 500 caíram (now-t ≥ janela); sobram 0 no map
    // → aceita, push 1500. Aos 1600: só 1500 ainda vale (100ms < 1s) → aceita.
    expect(rl.ok('ip1', 1500)).toBe(true)
    expect(rl.ok('ip1', 1600)).toBe(true)
    // Aos 1700 (3ª tentativa dentro da nova janela): 1500 e 1600 ainda válidos → bloqueia
    expect(rl.ok('ip1', 1700)).toBe(false)
  })

  it('chaves independentes não interferem', () => {
    const rl = criarRateLimiter({ janelaMs: 60_000, max: 1 })
    expect(rl.ok('ip1', 0)).toBe(true)
    expect(rl.ok('ip2', 0)).toBe(true)
    expect(rl.ok('ip1', 100)).toBe(false)
    expect(rl.ok('ip2', 100)).toBe(false)
  })

  it('fail-open quando key vazia/undefined/null (não trava legítimo por proxy estranho)', () => {
    const rl = criarRateLimiter({ janelaMs: 60_000, max: 1 })
    // rate máx=1: consumindo com null NÃO conta pra nada — permite indefinidamente
    for (let i = 0; i < 100; i++) {
      expect(rl.ok(undefined, i)).toBe(true)
      expect(rl.ok(null, i)).toBe(true)
      expect(rl.ok('', i)).toBe(true)
    }
  })

  it('housekeeping remove IPs sem hits recentes quando cresce', () => {
    const rl = criarRateLimiter({ janelaMs: 1_000, max: 1, capacidade: 2 })
    rl.ok('a', 0); rl.ok('b', 0); rl.ok('c', 0) // 3 IPs, capacidade=2 → dispara GC
    expect(rl.size()).toBeLessThanOrEqual(3)
    // após avanço do relógio, próxima inserção deve limpar antigas
    rl.ok('d', 5_000)
    expect(rl.size()).toBe(1)
  })

  it('a janela é estritamente < janelaMs (registro exatamente no limite ainda conta)', () => {
    const rl = criarRateLimiter({ janelaMs: 1_000, max: 1 })
    expect(rl.ok('x', 0)).toBe(true)
    // 999ms depois: mesma janela → bloqueia
    expect(rl.ok('x', 999)).toBe(false)
    // 1000ms exato: (now - t) === janelaMs → cai fora do filtro < janelaMs → libera
    expect(rl.ok('x', 1000)).toBe(true)
  })
})
