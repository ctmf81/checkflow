// Testes do gating de tipos de atividade por serviço do plano (lib/tiposAtividade.ts).
import { describe, it, expect } from 'vitest'
import { tiposAtividadeDisponiveis, tipoLiberado, TIPOS_ATIVIDADE } from '@/lib/tiposAtividade'

const catalogoTipo = TIPOS_ATIVIDADE.find(t => t.value === 'catalogo')!
const textoTipo = TIPOS_ATIVIDADE.find(t => t.value === 'texto')!

describe('tipoLiberado', () => {
  it('tipo sem serviço vinculado sempre liberado', () => {
    expect(tipoLiberado(textoTipo, new Set(), new Set())).toBe(true)
  })
  it('catalogo liberado só quando o plano inclui o recurso "catalogos"', () => {
    expect(tipoLiberado(catalogoTipo, new Set(['catalogos']), new Set())).toBe(true)
    expect(tipoLiberado(catalogoTipo, new Set(['tickets']), new Set())).toBe(false)
  })
  it('recursos null = sem restrição (mostra tudo)', () => {
    expect(tipoLiberado(catalogoTipo, null, null)).toBe(true)
  })
})

describe('tiposAtividadeDisponiveis', () => {
  it('plano sem "catalogos" esconde o tipo Catálogo (mantém os demais)', () => {
    const lista = tiposAtividadeDisponiveis(new Set(['tickets']), new Set())
    expect(lista.some(t => t.value === 'catalogo')).toBe(false)
    expect(lista.some(t => t.value === 'texto')).toBe(true)
    expect(lista.some(t => t.value === 'foto')).toBe(true)
  })
  it('plano com "catalogos" mostra o Catálogo', () => {
    const lista = tiposAtividadeDisponiveis(new Set(['catalogos']), new Set())
    expect(lista.some(t => t.value === 'catalogo')).toBe(true)
  })
  it('recursos null = todos os tipos', () => {
    expect(tiposAtividadeDisponiveis(null, null)).toHaveLength(TIPOS_ATIVIDADE.length)
  })
  it('na edição, o tipo atual é mantido mesmo se gateado', () => {
    // plano sem catalogos, mas editando uma atividade que já é catalogo
    const lista = tiposAtividadeDisponiveis(new Set(['tickets']), new Set(), 'catalogo')
    expect(lista.some(t => t.value === 'catalogo')).toBe(true)
  })
  it('tipoAtual não gateado não duplica na lista', () => {
    const lista = tiposAtividadeDisponiveis(new Set(['catalogos']), new Set(), 'catalogo')
    expect(lista.filter(t => t.value === 'catalogo')).toHaveLength(1)
  })
})
