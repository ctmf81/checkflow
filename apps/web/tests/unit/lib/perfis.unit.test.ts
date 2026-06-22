import { describe, it, expect } from 'vitest'
import {
  permKey, recursoChecked, recursoIndeterminate, toggleRecurso, toggleAcao,
  permsFromRows, permissaoIdsToInsert, type Recurso,
} from '../../../lib/perfis'

// Lógica pura da árvore de permissões de Perfil. Cobre o tri-state dos
// recursos, os toggles e o mapeamento perms↔linhas do banco — onde mora o
// risco do bug que apagava permissões na edição.

const checklists: Recurso = {
  key: 'checklists', label: 'Checklists',
  acoes: [
    { key: 'criar', label: 'Criar' },
    { key: 'editar', label: 'Editar' },
    { key: 'excluir', label: 'Excluir' },
  ],
}
const home: Recurso = { key: 'home', label: 'Home', acoes: [] } // recurso sem ações

describe('permKey', () => {
  it('monta recurso.acao, ou só recurso sem ação', () => {
    expect(permKey('checklists', 'criar')).toBe('checklists.criar')
    expect(permKey('home')).toBe('home')
  })
})

describe('recursoChecked / recursoIndeterminate', () => {
  it('todas as ações marcadas → checked, não indeterminate', () => {
    const perms = new Set(['checklists.criar', 'checklists.editar', 'checklists.excluir'])
    expect(recursoChecked(checklists, perms)).toBe(true)
    expect(recursoIndeterminate(checklists, perms)).toBe(false)
  })

  it('algumas ações marcadas → indeterminate, não checked', () => {
    const perms = new Set(['checklists.criar'])
    expect(recursoChecked(checklists, perms)).toBe(false)
    expect(recursoIndeterminate(checklists, perms)).toBe(true)
  })

  it('nenhuma ação marcada → nem checked nem indeterminate', () => {
    const perms = new Set<string>()
    expect(recursoChecked(checklists, perms)).toBe(false)
    expect(recursoIndeterminate(checklists, perms)).toBe(false)
  })

  it('recurso sem ações usa a própria chave', () => {
    expect(recursoChecked(home, new Set(['home']))).toBe(true)
    expect(recursoChecked(home, new Set())).toBe(false)
    expect(recursoIndeterminate(home, new Set(['home']))).toBe(false)
  })
})

describe('toggleRecurso', () => {
  it('parcial/vazio → marca todas as ações', () => {
    expect(toggleRecurso(checklists, new Set(['checklists.criar'])))
      .toEqual(new Set(['checklists.criar', 'checklists.editar', 'checklists.excluir']))
    expect(toggleRecurso(checklists, new Set()))
      .toEqual(new Set(['checklists.criar', 'checklists.editar', 'checklists.excluir']))
  })

  it('tudo marcado → desmarca todas', () => {
    const cheio = new Set(['checklists.criar', 'checklists.editar', 'checklists.excluir'])
    expect(toggleRecurso(checklists, cheio)).toEqual(new Set())
  })

  it('recurso sem ações alterna a própria chave', () => {
    expect(toggleRecurso(home, new Set())).toEqual(new Set(['home']))
    expect(toggleRecurso(home, new Set(['home']))).toEqual(new Set())
  })

  it('não muta o Set original', () => {
    const orig = new Set(['checklists.criar'])
    toggleRecurso(checklists, orig)
    expect(orig).toEqual(new Set(['checklists.criar']))
  })

  it('preserva permissões de outros recursos', () => {
    const perms = new Set(['grupos.criar'])
    expect(toggleRecurso(checklists, perms))
      .toEqual(new Set(['grupos.criar', 'checklists.criar', 'checklists.editar', 'checklists.excluir']))
  })
})

describe('toggleAcao', () => {
  it('adiciona se ausente, remove se presente', () => {
    expect(toggleAcao('checklists', 'criar', new Set())).toEqual(new Set(['checklists.criar']))
    expect(toggleAcao('checklists', 'criar', new Set(['checklists.criar']))).toEqual(new Set())
  })
})

describe('permsFromRows', () => {
  it('constrói o Set a partir das linhas do banco', () => {
    const rows = [
      { recurso: 'checklists', acao: 'criar' },
      { recurso: 'grupos', acao: 'editar' },
    ]
    expect(permsFromRows(rows)).toEqual(new Set(['checklists.criar', 'grupos.editar']))
  })

  it('lista vazia → Set vazio', () => {
    expect(permsFromRows([])).toEqual(new Set())
  })
})

describe('permissaoIdsToInsert', () => {
  const permsDb = [
    { id: 'p1', recurso: 'checklists', acao: 'criar' },
    { id: 'p2', recurso: 'checklists', acao: 'editar' },
    { id: 'p3', recurso: 'grupos', acao: 'criar' },
  ]

  it('devolve só os ids cujas permissões estão marcadas', () => {
    const perms = new Set(['checklists.criar', 'grupos.criar'])
    expect(permissaoIdsToInsert(permsDb, perms)).toEqual(['p1', 'p3'])
  })

  it('nada marcado → lista vazia (não apaga por engano, mas também não insere)', () => {
    expect(permissaoIdsToInsert(permsDb, new Set())).toEqual([])
  })

  it('match por recurso (sem ação) também conta', () => {
    const db = [{ id: 'h', recurso: 'home', acao: '' }]
    expect(permissaoIdsToInsert(db, new Set(['home']))).toEqual(['h'])
  })
})
