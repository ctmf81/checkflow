// Testes da lib/useOnlineStatus.ts — hook de status de conexão usado para
// avisar o operador e ativar o salvamento local. Cobre: estado inicial =
// navigator.onLine e reação aos eventos online/offline do navegador.
//
// Renderizamos com o `act`/createRoot nativos do React (sem testing-library):
// uma sonda mínima expõe o valor retornado pelo hook.
import { describe, it, expect, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useOnlineStatus } from '@/lib/useOnlineStatus'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

function renderHook() {
  let current: boolean | undefined
  function Probe() {
    current = useOnlineStatus()
    return null
  }
  const container = document.createElement('div')
  const root: Root = createRoot(container)
  act(() => {
    root.render(createElement(Probe))
  })
  return {
    get value() {
      return current
    },
    unmount() {
      act(() => root.unmount())
    },
  }
}

afterEach(() => {
  setOnline(true)
})

describe('useOnlineStatus', () => {
  it('inicia refletindo navigator.onLine = true', () => {
    setOnline(true)
    const h = renderHook()
    expect(h.value).toBe(true)
    h.unmount()
  })

  it('inicia refletindo navigator.onLine = false (já estava offline ao montar)', () => {
    setOnline(false)
    const h = renderHook()
    expect(h.value).toBe(false)
    h.unmount()
  })

  it('passa a false ao receber o evento offline', () => {
    setOnline(true)
    const h = renderHook()
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(h.value).toBe(false)
    h.unmount()
  })

  it('volta a true ao receber o evento online', () => {
    setOnline(false)
    const h = renderHook()
    expect(h.value).toBe(false)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(h.value).toBe(true)
    h.unmount()
  })
})
