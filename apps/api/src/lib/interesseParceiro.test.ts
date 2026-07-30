import { describe, it, expect } from 'vitest'
import { validarInteresseParceiro, montarMensagem, cpfValido, cnpjValido, documentoValido } from './interesseParceiro'

describe('validação de documento (dígito verificador)', () => {
  it('CPF válido', () => {
    expect(cpfValido('111.444.777-35')).toBe(true)
    expect(cpfValido('12345678909')).toBe(true)
  })
  it('CPF inválido (dígito errado / todos iguais / tamanho)', () => {
    expect(cpfValido('111.444.777-30')).toBe(false)
    expect(cpfValido('11111111111')).toBe(false)
    expect(cpfValido('123')).toBe(false)
  })
  it('CNPJ válido', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
  })
  it('CNPJ inválido (dígito errado / todos iguais)', () => {
    expect(cnpjValido('11.222.333/0001-99')).toBe(false)
    expect(cnpjValido('00000000000000')).toBe(false)
  })
  it('documentoValido aceita CPF ou CNPJ e rejeita o resto', () => {
    expect(documentoValido('12345678909')).toBe(true)
    expect(documentoValido('11222333000181')).toBe(true)
    expect(documentoValido('12345678900')).toBe(false) // 11 díg. mas DV errado
    expect(documentoValido('123456789')).toBe(false)
  })
})

describe('validarInteresseParceiro()', () => {
  const base = {
    nome: 'Ana Consultora',
    documento: '123.456.789-09',
    email: 'ana@exemplo.com',
    telefone: '(11) 99999-8888',
  }

  it('aceita um envio válido e normaliza documento/telefone', () => {
    const r = validarInteresseParceiro({ ...base, nome: '  Ana  ', cep: '01001-000' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.dados.nome).toBe('Ana')
      expect(r.dados.documento).toBe('12345678909') // só dígitos
      expect(r.dados.cep).toBe('01001000')
      expect(r.dados.email).toBe('ana@exemplo.com')
    }
  })

  it('aceita CNPJ (14 dígitos)', () => {
    const r = validarInteresseParceiro({ ...base, documento: '11.222.333/0001-81' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.dados.documento).toBe('11222333000181')
  })

  it('rejeita documento que não é CPF nem CNPJ', () => {
    const r = validarInteresseParceiro({ ...base, documento: '123' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/CPF|CNPJ/i)
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

  it('rejeita telefone curto', () => {
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

  it('compõe a mensagem com área, cidade/UF e observação', () => {
    const r = validarInteresseParceiro({
      ...base, area: 'Qualidade', cidade: 'Recife', estado: 'PE', observacao: 'Tenho 20 clientes',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.dados.mensagem).toContain('Área de atuação: Qualidade')
      expect(r.dados.mensagem).toContain('Cidade/UF: Recife/PE')
      expect(r.dados.mensagem).toContain('Observação: Tenho 20 clientes')
      expect(r.dados.mensagem).toContain('[Interesse via apresentação]')
    }
  })
})

describe('montarMensagem()', () => {
  it('marca a origem mesmo sem campos opcionais', () => {
    expect(montarMensagem({})).toBe('[Interesse via apresentação]')
  })

  it('omite cidade/UF quando não há CEP resolvido', () => {
    const m = montarMensagem({ area: 'Processos' })
    expect(m).toContain('Área de atuação: Processos')
    expect(m).not.toContain('Cidade/UF')
  })
})
