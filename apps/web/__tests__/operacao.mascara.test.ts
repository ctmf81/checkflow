/**
 * Testes unitários: aplicação de máscara em campos de texto
 */

import { describe, it, expect } from 'vitest'

// Função espelhada do CampoTexto (operacao/[id]/page.tsx)
function aplicarMascara(mascara: string, input: string): string {
  if (!mascara) return input
  let result = ''
  let j = 0
  for (let i = 0; i < mascara.length && j < input.length; i++) {
    if (mascara[i] === '9') {
      if (/\d/.test(input[j])) { result += input[j++] } else { j++; i-- }
    } else if (mascara[i] === 'A') {
      if (/[a-zA-Z]/.test(input[j])) { result += input[j++].toUpperCase() } else { j++; i-- }
    } else if (mascara[i] === '*') {
      result += input[j++]
    } else {
      result += mascara[i]
      if (input[j] === mascara[i]) j++
    }
  }
  return result
}

describe('aplicarMascara', () => {
  describe('placa veicular (000-0000 → AAA-9999)', () => {
    const mascara = 'AAA-9999'

    it('formata placa correta', () => {
      expect(aplicarMascara(mascara, 'ABC1234')).toBe('ABC-1234')
    })
    it('converte letras para maiúsculas', () => {
      expect(aplicarMascara(mascara, 'abc1234')).toBe('ABC-1234')
    })
    it('para incompleta, retorna o que tem', () => {
      expect(aplicarMascara(mascara, 'AB1')).toBe('AB')
    })
    it('ignora caracteres inválidos na posição errada', () => {
      // dígito onde deveria ser letra → ignora e tenta avançar
      expect(aplicarMascara(mascara, '1BC1234')).toBe('BC-1234')
    })
  })

  describe('CPF (999.999.999-99)', () => {
    const mascara = '999.999.999-99'
    it('formata CPF correto', () => {
      expect(aplicarMascara(mascara, '12345678901')).toBe('123.456.789-01')
    })
    it('para incompleto', () => {
      expect(aplicarMascara(mascara, '123')).toBe('123')
    })
  })

  describe('sem máscara', () => {
    it('retorna o input sem modificação', () => {
      expect(aplicarMascara('', 'qualquercoisa')).toBe('qualquercoisa')
    })
  })

  describe('máscara com wildcard (*)', () => {
    it('aceita qualquer caractere na posição *', () => {
      expect(aplicarMascara('**-99', 'AB12')).toBe('AB-12')
    })
  })
})
