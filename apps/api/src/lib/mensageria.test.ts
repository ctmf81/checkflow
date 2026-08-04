import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks dos dois canais — a lógica de ordem/fallback é o que testamos.
const enviarWhatsApp = vi.fn()
const enviarWhatsAppMidia = vi.fn()
const enviarTelegram = vi.fn()
const enviarTelegramFoto = vi.fn()

vi.mock('./whatsapp', () => ({
  enviarWhatsApp: (...a: any[]) => enviarWhatsApp(...a),
  enviarWhatsAppMidia: (...a: any[]) => enviarWhatsAppMidia(...a),
}))
vi.mock('./telegram', () => ({
  enviarTelegram: (...a: any[]) => enviarTelegram(...a),
  enviarTelegramFoto: (...a: any[]) => enviarTelegramFoto(...a),
}))

import { enviarComFallback } from './mensageria'

const OK = { ok: true }
const FALHA = { ok: false, erro: 'x' }

beforeEach(() => {
  vi.clearAllMocks()
  enviarWhatsApp.mockResolvedValue(OK)
  enviarWhatsAppMidia.mockResolvedValue(OK)
  enviarTelegram.mockResolvedValue(OK)
  enviarTelegramFoto.mockResolvedValue(OK)
})

describe('enviarComFallback()', () => {
  it('WhatsApp OK: usa WhatsApp, não toca no Telegram', async () => {
    const r = await enviarComFallback({ numero: '5511999', telegramChatId: '123', mensagem: 'oi' })
    expect(r).toEqual({ ok: true, canal: 'whatsapp' })
    expect(enviarWhatsApp).toHaveBeenCalledOnce()
    expect(enviarTelegram).not.toHaveBeenCalled()
  })

  it('WhatsApp falha: cai para o Telegram', async () => {
    enviarWhatsApp.mockResolvedValue(FALHA)
    const r = await enviarComFallback({ numero: '5511999', telegramChatId: '123', mensagem: 'oi' })
    expect(r).toEqual({ ok: true, canal: 'telegram' })
    expect(enviarWhatsApp).toHaveBeenCalledOnce()
    expect(enviarTelegram).toHaveBeenCalledOnce()
  })

  it('sem telefone, só Telegram: usa o Telegram', async () => {
    const r = await enviarComFallback({ telegramChatId: '123', mensagem: 'oi' })
    expect(r).toEqual({ ok: true, canal: 'telegram' })
    expect(enviarWhatsApp).not.toHaveBeenCalled()
  })

  it('preferirTelegram: tenta o Telegram primeiro', async () => {
    const r = await enviarComFallback({ numero: '5511999', telegramChatId: '123', mensagem: 'oi', preferirTelegram: true })
    expect(r).toEqual({ ok: true, canal: 'telegram' })
    expect(enviarTelegram).toHaveBeenCalledOnce()
    expect(enviarWhatsApp).not.toHaveBeenCalled()
  })

  it('preferirTelegram + Telegram falha: cai para o WhatsApp', async () => {
    enviarTelegram.mockResolvedValue(FALHA)
    const r = await enviarComFallback({ numero: '5511999', telegramChatId: '123', mensagem: 'oi', preferirTelegram: true })
    expect(r).toEqual({ ok: true, canal: 'whatsapp' })
    expect(enviarTelegram).toHaveBeenCalledOnce()
    expect(enviarWhatsApp).toHaveBeenCalledOnce()
  })

  it('com imagemUrl: usa mídia (WhatsApp) / sendPhoto (Telegram), não o texto puro', async () => {
    enviarWhatsAppMidia.mockResolvedValue(FALHA)
    const r = await enviarComFallback({ numero: '5511999', telegramChatId: '123', mensagem: 'cap', imagemUrl: 'http://x/y.jpg' })
    expect(enviarWhatsAppMidia).toHaveBeenCalledOnce()
    expect(enviarWhatsApp).not.toHaveBeenCalled()
    expect(enviarTelegramFoto).toHaveBeenCalledOnce()
    expect(enviarTelegram).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: true, canal: 'telegram' })
  })

  it('ambos os canais falham: ok=false', async () => {
    enviarWhatsApp.mockResolvedValue(FALHA)
    enviarTelegram.mockResolvedValue(FALHA)
    const r = await enviarComFallback({ numero: '5511999', telegramChatId: '123', mensagem: 'oi' })
    expect(r.ok).toBe(false)
  })

  it('sem nenhum canal: ok=false, não envia nada', async () => {
    const r = await enviarComFallback({ mensagem: 'oi' })
    expect(r.ok).toBe(false)
    expect(enviarWhatsApp).not.toHaveBeenCalled()
    expect(enviarTelegram).not.toHaveBeenCalled()
  })
})
