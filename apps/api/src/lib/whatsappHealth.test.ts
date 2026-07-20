import { describe, it, expect } from 'vitest'
import { decidirAlertaWhatsapp } from './whatsappHealth'

describe('decidirAlertaWhatsapp()', () => {
  it('primeira checagem já conectado: não alerta', () => {
    const d = decidirAlertaWhatsapp(null, true)
    expect(d).toEqual({ mudou: false, caiuPrimeiraVez: false, alertar: false, transicao: null })
  })

  it('primeira checagem já fora: alerta "caiu"', () => {
    const d = decidirAlertaWhatsapp(null, false)
    expect(d.alertar).toBe(true)
    expect(d.transicao).toBe('caiu')
    expect(d.caiuPrimeiraVez).toBe(true)
  })

  it('conectado→fora: alerta "caiu"', () => {
    const d = decidirAlertaWhatsapp(true, false)
    expect(d).toEqual({ mudou: true, caiuPrimeiraVez: false, alertar: true, transicao: 'caiu' })
  })

  it('fora→conectado: alerta "voltou"', () => {
    const d = decidirAlertaWhatsapp(false, true)
    expect(d).toEqual({ mudou: true, caiuPrimeiraVez: false, alertar: true, transicao: 'voltou' })
  })

  it('estável conectado: não alerta (anti-spam)', () => {
    expect(decidirAlertaWhatsapp(true, true).alertar).toBe(false)
  })

  it('estável fora: NÃO re-alerta (só na transição)', () => {
    // Este é o caso que quebrava com réplicas: cada processo re-alertava porque
    // via `ultimoOk=null`. Com o estado compartilhado, fora→fora não alerta.
    const d = decidirAlertaWhatsapp(false, false)
    expect(d.alertar).toBe(false)
    expect(d.mudou).toBe(false)
    expect(d.transicao).toBeNull()
  })
})
