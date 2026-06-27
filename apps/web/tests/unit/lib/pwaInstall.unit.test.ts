// Testes da lib/pwaInstall.ts — gerencia o evento `beforeinstallprompt` (Android/
// Chrome) e detecta se o app já roda instalado (standalone/iOS). Cobre: captura
// do evento, prompt nativo (aceito/recusado/indisponível), pub/sub dos
// listeners, limpeza no `appinstalled` e os detectores isStandalone/isIOS.
//
// O módulo guarda estado em singleton (deferredPrompt/initialized/listeners),
// então cada teste recarrega o módulo do zero com vi.resetModules().
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type PwaModule = typeof import('@/lib/pwaInstall')

async function loadFresh(): Promise<PwaModule> {
  vi.resetModules()
  return import('@/lib/pwaInstall')
}

// Dispara um beforeinstallprompt sintético com os métodos que o app usa.
function dispararBeforeInstall() {
  const evt = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  evt.prompt = vi.fn().mockResolvedValue(undefined)
  evt.userChoice = Promise.resolve({ outcome: 'accepted' })
  window.dispatchEvent(evt)
  return evt
}

// Cada loadFresh() recarrega o módulo e o initPwaInstall registra novos
// listeners no window (compartilhado pelo jsdom). Sem remover, os listeners das
// instâncias antigas acumulam entre os testes. Embrulhamos addEventListener
// para rastrear o que foi adicionado e removemos tudo no afterEach.
const addedListeners: Array<{ type: string; handler: EventListenerOrEventListenerObject }> = []
let realAdd: typeof window.addEventListener

beforeEach(() => {
  addedListeners.length = 0
  realAdd = window.addEventListener.bind(window) as typeof window.addEventListener
  window.addEventListener = ((type: string, handler: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    addedListeners.push({ type, handler })
    realAdd(type, handler, opts)
  }) as typeof window.addEventListener
})

afterEach(() => {
  window.addEventListener = realAdd
  for (const { type, handler } of addedListeners) window.removeEventListener(type, handler)
  vi.restoreAllMocks()
  delete (window.navigator as { userAgent?: string }).userAgent
  delete (window.navigator as { standalone?: boolean }).standalone
})

describe('captura do beforeinstallprompt', () => {
  it('sem evento capturado, canPromptInstall é false', async () => {
    const m = await loadFresh()
    m.initPwaInstall()
    expect(m.canPromptInstall()).toBe(false)
  })

  it('após o evento, canPromptInstall vira true e os assinantes são notificados', async () => {
    const m = await loadFresh()
    const cb = vi.fn()
    m.subscribePwaInstall(cb)
    m.initPwaInstall()
    dispararBeforeInstall()
    expect(m.canPromptInstall()).toBe(true)
    expect(cb).toHaveBeenCalled()
  })
})

describe('promptInstall', () => {
  it('retorna false (sem lançar) quando não há prompt disponível', async () => {
    const m = await loadFresh()
    m.initPwaInstall()
    await expect(m.promptInstall()).resolves.toBe(false)
  })

  it('dispara o prompt nativo e retorna true quando o usuário aceita', async () => {
    const m = await loadFresh()
    m.initPwaInstall()
    const evt = dispararBeforeInstall() // userChoice = accepted
    const aceitou = await m.promptInstall()
    expect(evt.prompt).toHaveBeenCalled()
    expect(aceitou).toBe(true)
    // Consumido: não pode ser disparado de novo.
    expect(m.canPromptInstall()).toBe(false)
  })

  it('retorna false quando o usuário recusa', async () => {
    const m = await loadFresh()
    m.initPwaInstall()
    const evt = new Event('beforeinstallprompt') as Event & {
      prompt: ReturnType<typeof vi.fn>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
    }
    evt.prompt = vi.fn().mockResolvedValue(undefined)
    evt.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(evt)
    expect(await m.promptInstall()).toBe(false)
  })
})

describe('appinstalled', () => {
  it('limpa o prompt e notifica quando o app é instalado', async () => {
    const m = await loadFresh()
    m.initPwaInstall()
    dispararBeforeInstall()
    expect(m.canPromptInstall()).toBe(true)
    const cb = vi.fn()
    m.subscribePwaInstall(cb)
    window.dispatchEvent(new Event('appinstalled'))
    expect(m.canPromptInstall()).toBe(false)
    expect(cb).toHaveBeenCalled()
  })
})

describe('subscribePwaInstall', () => {
  it('o unsubscribe interrompe as notificações', async () => {
    const m = await loadFresh()
    m.initPwaInstall()
    const cb = vi.fn()
    const off = m.subscribePwaInstall(cb)
    off()
    dispararBeforeInstall()
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('isStandalone', () => {
  it('true quando display-mode: standalone casa', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const m = await loadFresh()
    expect(m.isStandalone()).toBe(true)
  })

  it('true quando navigator.standalone (iOS) é true', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true })
    const m = await loadFresh()
    expect(m.isStandalone()).toBe(true)
  })

  it('false quando não casa nenhum critério (rodando no navegador)', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    const m = await loadFresh()
    expect(m.isStandalone()).toBe(false)
  })
})

describe('isIOS', () => {
  it('detecta iPhone/iPad pelo userAgent', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605',
    })
    const m = await loadFresh()
    expect(m.isIOS()).toBe(true)
  })

  it('false em Android', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
    })
    const m = await loadFresh()
    expect(m.isIOS()).toBe(false)
  })
})
