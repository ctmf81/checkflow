/**
 * Testes unitários: aplicação de máscara em campos de texto
 */

import { describe, it, expect } from 'vitest'

// Função espelhada do CampoTexto (operacao/[id]/page.tsx)
function indexOfMatch(input: string, from: number, re: RegExp): number {
  for (let k = from; k < input.length; k++) if (re.test(input[k])) return k
  return -1
}

function aplicarMascara(mascara: string, input: string): string {
  if (!mascara) return input
  let result = ''
  let j = 0
  for (let i = 0; i < mascara.length && j < input.length; i++) {
    if (mascara[i] === '9') {
      const k = indexOfMatch(input, j, /\d/)
      if (k === -1) continue
      result += input[k]
      j = k + 1
    } else if (mascara[i] === 'A') {
      const k = indexOfMatch(input, j, /[a-zA-Z]/)
      if (k === -1) continue
      result += input[k].toUpperCase()
      j = k + 1
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
      // sem mais letras disponíveis, pula a posição de letra restante e
      // segue aplicando o restante da máscara aos caracteres remanescentes
      expect(aplicarMascara(mascara, 'AB1')).toBe('AB-1')
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
