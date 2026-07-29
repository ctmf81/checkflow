import { describe, it, expect } from 'vitest'
import { validarInteresseParceiro, montarEmailInteresse } from './interesseParceiro'

describe('validarInteresseParceiro()', () => {
  const base = { nome: 'Ana Consultora', email: 'ana@exemplo.com', telefone: '(11) 99999-8888' }

  it('aceita um envio válido e normaliza (trim + cap)', () => {
    const r = validarInteresseParceiro({ ...base, nome: '  Ana  ', cidade: 'Recife', area: 'Qualidade' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.dados.nome).toBe('Ana')
      expect(r.dados.cidade).toBe('Recife')
      expect(r.dados.email).toBe('ana@exemplo.com')
    }
  })

  it('rejeita nome ausente', () => {
    const r = validarInteresseParceiro({ ...base, nome: ' ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/nome/i)
  })

  it('rejeita e-mail inválido', () => {
    const r = validarInteresseParceiro({ ...base, email: 'nao-eh-email' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/e-mail/i)
  })

  it('rejeita telefone curto (menos de 8 dígitos)', () => {
    const r = validarInteresseParceiro({ ...base, telefone: '123' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/telefone/i)
  })

  it('honeypot preenchido é marcado como spam', () => {
    const r = validarInteresseParceiro({ ...base, website: 'http://bot.com' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.spam).toBe(true)
  })

  it('trata corpo indefinido sem quebrar', () => {
    expect(validarInteresseParceiro(undefined).ok).toBe(false)
  })

  it('limita o tamanho da observação', () => {
    const r = validarInteresseParceiro({ ...base, observacao: 'x'.repeat(5000) })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.dados.observacao.length).toBe(2000)
  })
})

describe('montarEmailInteresse()', () => {
  it('inclui os campos preenchidos e escapa HTML', () => {
    const { assunto, html } = montarEmailInteresse({
      nome: 'Ana <b>', cidade: 'Recife', area: 'Qualidade',
      observacao: '', telefone: '11999998888', email: 'ana@exemplo.com',
    })
    expect(assunto).toContain('Ana')
    expect(html).toContain('ana@exemplo.com')
    expect(html).toContain('Ana &lt;b&gt;') // escapado, não injeta tag
    expect(html).not.toContain('<b>')
  })

  it('omite linhas de campos vazios', () => {
    const { html } = montarEmailInteresse({
      nome: 'Ana', cidade: '', area: '', observacao: '', telefone: '11999998888', email: 'ana@exemplo.com',
    })
    expect(html).not.toContain('Área de atuação')
    expect(html).not.toContain('Observação')
  })
})
