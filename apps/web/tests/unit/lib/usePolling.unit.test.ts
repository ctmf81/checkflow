// Testes da lib/usePolling.ts — polling leve com pausa por aba oculta.
// Fake timers controlam o setInterval; document.hidden + evento visibilitychange
// simulam a aba indo para segundo plano e voltando.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { usePolling } from '@/lib/usePolling'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function setHidden(value: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value })
}
function fireVisibility() {
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}

function renderHook(cb: () => void, intervalMs = 1000, enabled = true) {
  function Probe() { usePolling(cb, intervalMs, enabled); return null }
  const container = document.createElement('div')
  const root: Root = createRoot(container)
  act(() => { root.render(createElement(Probe)) })
  return { unmount() { act(() => root.unmount()) } }
}

beforeEach(() => { vi.useFakeTimers(); setHidden(false) })
afterEach(() => { vi.useRealTimers(); setHidden(false) })

describe('usePolling', () => {
  it('chama o callback a cada intervalo enquanto visível', () => {
    const cb = vi.fn()
    const h = renderHook(cb, 1000)
    expect(cb).toHaveBeenCalledTimes(0)        // não chama no mount
    act(() => vi.advanceTimersByTime(1000)); expect(cb).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(2000)); expect(cb).toHaveBeenCalledTimes(3)
    h.unmount()
  })

  it('pausa quando a aba fica oculta e retoma (com refetch) ao voltar', () => {
    const cb = vi.fn()
    const h = renderHook(cb, 1000)
    act(() => vi.advanceTimersByTime(1000)); expect(cb).toHaveBeenCalledTimes(1)

    // aba oculta → não chama mais
    setHidden(true); fireVisibility()
    act(() => vi.advanceTimersByTime(5000)); expect(cb).toHaveBeenCalledTimes(1)

    // volta → refetch imediato (+1) e retoma o intervalo
    setHidden(false); fireVisibility()
    expect(cb).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(1000)); expect(cb).toHaveBeenCalledTimes(3)
    h.unmount()
  })

  it('enabled=false não dispara nada', () => {
    const cb = vi.fn()
    const h = renderHook(cb, 1000, false)
    act(() => vi.advanceTimersByTime(5000)); expect(cb).toHaveBeenCalledTimes(0)
    h.unmount()
  })

  it('para de chamar após desmontar', () => {
    const cb = vi.fn()
    const h = renderHook(cb, 1000)
    act(() => vi.advanceTimersByTime(1000)); expect(cb).toHaveBeenCalledTimes(1)
    h.unmount()
    act(() => vi.advanceTimersByTime(5000)); expect(cb).toHaveBeenCalledTimes(1)
  })
})
