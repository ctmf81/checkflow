// Testes do template da vertical + validador (lib/demo/verticais, validarTemplate).
import { describe, it, expect } from 'vitest'
import { validarTemplate } from '@/lib/demo/validarTemplate'
import { verticalPorId, listarVerticais, VERTICAIS } from '@/lib/demo/verticais'
import { fabricaAlimentos } from '@/lib/demo/verticais/fabricaAlimentos'
import type { VerticalTemplate } from '@/lib/demo/tipos'

describe('registry de verticais', () => {
  it('resolve fabrica_alimentos e ignora id desconhecido', () => {
    expect(verticalPorId('fabrica_alimentos')).toBe(fabricaAlimentos)
    expect(verticalPorId('inexistente')).toBeNull()
    expect(verticalPorId(null)).toBeNull()
  })
  it('lista as verticais com id+nome', () => {
    const lista = listarVerticais()
    expect(lista.some(v => v.id === 'fabrica_alimentos' && v.nome === 'Fábrica de Alimentos')).toBe(true)
  })
})

describe('validarTemplate — todos os templates registrados', () => {
  for (const t of Object.values(VERTICAIS)) {
    it(`"${t.nome}" está bem-formado`, () => {
      expect(validarTemplate(t)).toEqual([])
    })
  }
})

describe('fabricaAlimentos — conteúdo coerente', () => {
  it('tem 5 checklists, catálogo de câmaras e 4 usuários', () => {
    expect(fabricaAlimentos.checklists).toHaveLength(5)
    expect(fabricaAlimentos.catalogos.some(c => c.nome === 'Câmaras Frias')).toBe(true)
    expect(fabricaAlimentos.usuarios).toHaveLength(4)
  })
  it('o checklist de temperatura usa o catálogo existente', () => {
    const cl = fabricaAlimentos.checklists.find(c => c.nome.includes('Temperatura'))!
    const usaCatalogo = cl.secoes.flatMap(s => s.atividades).some(a => a.tipo === 'catalogo' && a.catalogo === 'Câmaras Frias')
    expect(usaCatalogo).toBe(true)
  })
  it('"Presença de corpo estranho" é conforme quando a resposta é "não"', () => {
    const cl = fabricaAlimentos.checklists.find(c => c.nome.includes('Envase'))!
    const a = cl.secoes.flatMap(s => s.atividades).find(x => x.nome.includes('corpo estranho'))!
    expect(a.simConforme).toBe('nao')
  })
})

describe('validarTemplate — pega templates quebrados', () => {
  it('checklist apontando para subgrupo inexistente', () => {
    const ruim: VerticalTemplate = {
      ...fabricaAlimentos,
      checklists: [{ ...fabricaAlimentos.checklists[0], subgrupo: 'Inexistente' }],
    }
    expect(validarTemplate(ruim).some(p => p.includes('subgrupo'))).toBe(true)
  })
  it('atividade catálogo referenciando catálogo ausente', () => {
    const ruim: VerticalTemplate = {
      ...fabricaAlimentos,
      catalogos: [],
    }
    expect(validarTemplate(ruim).some(p => p.includes('catálogo'))).toBe(true)
  })
  it('sem usuário operador', () => {
    const ruim: VerticalTemplate = {
      ...fabricaAlimentos,
      usuarios: fabricaAlimentos.usuarios.filter(u => u.papel !== 'operador'),
    }
    expect(validarTemplate(ruim).some(p => p.includes('operador'))).toBe(true)
  })
})
