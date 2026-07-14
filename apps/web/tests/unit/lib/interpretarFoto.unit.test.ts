// Testes da lógica pura da interpretação de foto por IA (lib/ia/interpretarFoto):
// composição do prompt por tipo + normalização da resposta bruta da IA.
import { describe, it, expect } from 'vitest'
import {
  SUFIXO_IA_FOTO, comporPromptFoto, normalizarSimNao, extrairNumero, posProcessarFoto,
} from '@/lib/ia/interpretarFoto'

describe('comporPromptFoto', () => {
  it('anexa o sufixo do tipo ao prompt do gestor', () => {
    expect(comporPromptFoto('Leia o manômetro', 'numero')).toBe('Leia o manômetro' + SUFIXO_IA_FOTO.numero)
    expect(comporPromptFoto('  Tem vazamento?  ', 'sim_nao')).toBe('Tem vazamento?' + SUFIXO_IA_FOTO.sim_nao)
  })
  it('tipo desconhecido → só o prompt', () => {
    expect(comporPromptFoto('Descreva', 'foto')).toBe('Descreva')
  })
})

describe('normalizarSimNao', () => {
  it('"sim" e variações → sim', () => {
    for (const t of ['sim', 'Sim', 'SIM', 'sim.', 'Sim, está ok', 's']) expect(normalizarSimNao(t)).toBe('sim')
  })
  it('"não"/"nao" e variações → nao', () => {
    for (const t of ['não', 'Não', 'nao', 'NÃO', 'não.', 'Não há vazamento', 'n']) expect(normalizarSimNao(t)).toBe('nao')
  })
  it('começo vence o meio (IA devolve a palavra primeiro)', () => {
    expect(normalizarSimNao('Sim, não há problema')).toBe('sim')
    expect(normalizarSimNao('Não, sinal de sim ausente')).toBe('nao')
  })
  it('vazio/indefinido → ""', () => {
    expect(normalizarSimNao('')).toBe('')
    expect(normalizarSimNao('talvez')).toBe('')
  })
})

describe('extrairNumero', () => {
  it('inteiro e decimal (ponto ou vírgula)', () => {
    expect(extrairNumero('42')).toBe('42')
    expect(extrairNumero('12.5')).toBe('12.5')
    expect(extrairNumero('12,5')).toBe('12.5')
    expect(extrairNumero('-3.2')).toBe('-3.2')
  })
  it('extrai o número do meio de um texto', () => {
    expect(extrairNumero('A pressão é 7.8 bar')).toBe('7.8')
    expect(extrairNumero('aprox. 100 unidades')).toBe('100')
  })
  it('sem número → ""', () => {
    expect(extrairNumero('não deu para ler')).toBe('')
    expect(extrairNumero('')).toBe('')
  })
})

describe('posProcessarFoto', () => {
  it('sim_nao → normaliza', () => {
    expect(posProcessarFoto('Não.', 'sim_nao')).toBe('nao')
  })
  it('numero → extrai', () => {
    expect(posProcessarFoto('Cerca de 23,4', 'numero')).toBe('23.4')
  })
  it('texto → no máximo 4 linhas, trim', () => {
    expect(posProcessarFoto('  l1\nl2\nl3\nl4\nl5\nl6  ', 'texto')).toBe('l1\nl2\nl3\nl4')
    expect(posProcessarFoto('linha única', 'texto')).toBe('linha única')
  })
})
