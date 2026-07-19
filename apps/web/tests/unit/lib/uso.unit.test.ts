/**
 * Testes do freio de cota de armazenamento (lib/uso.ts).
 *
 * Regra: `armazenamentoDisponivel` bloqueia (false) SÓ quando a RPC
 * `billing_armazenamento_disponivel` responde explicitamente `false`.
 * Fail-open no resto (sem empresa/bytes, ou erro na RPC) para não travar o
 * fluxo do operador por indisponibilidade da checagem.
 */

import { describe, it, expect, vi } from 'vitest'
import { armazenamentoDisponivel, somaBytes } from '../../../lib/uso'

function mockSb(rpcResult: { data: unknown; error: { message: string } | null }): any {
  return { rpc: vi.fn(async () => rpcResult) }
}

describe('armazenamentoDisponivel()', () => {
  it('bloqueia (false) só quando a RPC retorna false', async () => {
    const sb = mockSb({ data: false, error: null })
    expect(await armazenamentoDisponivel(sb, 'emp-1', 1000)).toBe(false)
  })

  it('libera quando a RPC retorna true', async () => {
    const sb = mockSb({ data: true, error: null })
    expect(await armazenamentoDisponivel(sb, 'emp-1', 1000)).toBe(true)
  })

  it('fail-open: sem empresa ou sem bytes não chama a RPC e libera', async () => {
    const sb = mockSb({ data: false, error: null })
    expect(await armazenamentoDisponivel(sb, null, 1000)).toBe(true)
    expect(await armazenamentoDisponivel(sb, 'emp-1', 0)).toBe(true)
    expect(await armazenamentoDisponivel(sb, 'emp-1', null)).toBe(true)
    expect(sb.rpc).not.toHaveBeenCalled()
  })

  it('fail-open: erro na RPC libera (não trava por indisponibilidade)', async () => {
    const sb = mockSb({ data: null, error: { message: 'timeout' } })
    expect(await armazenamentoDisponivel(sb, 'emp-1', 1000)).toBe(true)
  })

  it('null/undefined da RPC (sem erro) libera — só false explícito bloqueia', async () => {
    expect(await armazenamentoDisponivel(mockSb({ data: null, error: null }), 'e', 1)).toBe(true)
  })
})

describe('somaBytes()', () => {
  it('soma tamanhos ignorando nulos/undefined', () => {
    expect(somaBytes([{ size: 100 }, { size: 250 }, null, undefined])).toBe(350)
    expect(somaBytes([])).toBe(0)
  })
})
