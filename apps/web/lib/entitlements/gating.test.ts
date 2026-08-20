import { describe, it, expect } from 'vitest'
import {
  planoLiberaRecurso, planoLiberaFlag, itemVisivelNoMenu,
  recursoVisivelNoPerfil, resolverAcoesRelatorios, RECURSOS_CORE,
} from './gating'

describe('RECURSOS_CORE', () => {
  it('contém os 3 core (unidades, perfis, usuarios) — nunca gateados por plano', () => {
    expect(RECURSOS_CORE.has('unidades')).toBe(true)
    expect(RECURSOS_CORE.has('perfis')).toBe(true)
    expect(RECURSOS_CORE.has('usuarios')).toBe(true)
    expect(RECURSOS_CORE.size).toBe(3)
  })
})

describe('planoLiberaRecurso', () => {
  it('sem recurso definido → libera', () => {
    expect(planoLiberaRecurso(null)).toBe(true)
    expect(planoLiberaRecurso(new Set(['checklists']), undefined)).toBe(true)
  })
  it('recurso core sempre liberado (independe do plano)', () => {
    expect(planoLiberaRecurso(new Set(), 'unidades')).toBe(true)
    expect(planoLiberaRecurso(new Set(['xpto']), 'perfis')).toBe(true)
  })
  it('null (trial/dev) libera qualquer recurso', () => {
    expect(planoLiberaRecurso(null, 'checklists')).toBe(true)
  })
  it('set explícito só libera o que contém', () => {
    expect(planoLiberaRecurso(new Set(['checklists']), 'checklists')).toBe(true)
    expect(planoLiberaRecurso(new Set(['checklists']), 'workflows')).toBe(false)
  })
})

describe('planoLiberaFlag', () => {
  it('sem flag → libera', () => {
    expect(planoLiberaFlag(null)).toBe(true)
    expect(planoLiberaFlag(new Set(['ia']), undefined)).toBe(true)
  })
  it('null (trial/dev) libera qualquer flag', () => {
    expect(planoLiberaFlag(null, 'ia')).toBe(true)
  })
  it('set explícito só libera o que contém', () => {
    expect(planoLiberaFlag(new Set(['ia']), 'ia')).toBe(true)
    expect(planoLiberaFlag(new Set(), 'ia')).toBe(false)
  })
})

describe('itemVisivelNoMenu', () => {
  const base = {
    isAdminSistema: false, isAdminEmpresa: false,
    recursosHabilitados: null, flagsHabilitadas: null,
    recursos: new Set<string>(), carregado: true,
  }

  it('admin de sistema vê tudo (bypass total)', () => {
    expect(itemVisivelNoMenu({ perm: 'x' }, { ...base, isAdminSistema: true })).toBe(true)
    expect(itemVisivelNoMenu({ admin: true }, { ...base, isAdminSistema: true })).toBe(true)
    expect(itemVisivelNoMenu({ flag: 'ia' }, { ...base, isAdminSistema: true, flagsHabilitadas: new Set() })).toBe(true)
  })

  it('flag do plano bloqueia até para admin da empresa', () => {
    const ctx = { ...base, isAdminEmpresa: true, flagsHabilitadas: new Set<string>() }
    expect(itemVisivelNoMenu({ flag: 'ia', perm: 'relatorios' }, ctx)).toBe(false)
  })

  it('admin da empresa vê tudo que o plano libera', () => {
    const ctx = { ...base, isAdminEmpresa: true }
    expect(itemVisivelNoMenu({ perm: 'checklists' }, ctx)).toBe(true)
    expect(itemVisivelNoMenu({ admin: true }, ctx)).toBe(true)
  })

  it('só-admin escondido para usuário comum', () => {
    expect(itemVisivelNoMenu({ admin: true }, base)).toBe(false)
  })

  it('usuário comum precisa da permissão no perfil (após carregar)', () => {
    expect(itemVisivelNoMenu({ perm: 'checklists' }, { ...base, recursos: new Set(['checklists']) })).toBe(true)
    expect(itemVisivelNoMenu({ perm: 'checklists' }, { ...base, recursos: new Set() })).toBe(false)
  })

  it('não carregado → esconde item com perm (evita flash)', () => {
    expect(itemVisivelNoMenu({ perm: 'checklists' }, { ...base, carregado: false })).toBe(false)
  })

  it('recurso core visível para admin da empresa mesmo com plano restrito', () => {
    const ctx = { ...base, isAdminEmpresa: true, recursosHabilitados: new Set<string>() }
    expect(itemVisivelNoMenu({ perm: 'unidades' }, ctx)).toBe(true)
  })
})

describe('recursoVisivelNoPerfil', () => {
  const core = new Set(['unidades', 'perfis', 'usuarios'])

  it('plano não configurado (null) → mostra tudo (opt-in)', () => {
    expect(recursoVisivelNoPerfil({ key: 'xpto' }, null, null, core)).toBe(true)
  })
  it('recurso core sempre aparece', () => {
    expect(recursoVisivelNoPerfil({ key: 'perfis' }, new Set(), null, core)).toBe(true)
  })
  it('recurso do plano aparece', () => {
    expect(recursoVisivelNoPerfil({ key: 'checklists' }, new Set(['checklists']), null, core)).toBe(true)
  })
  it('recurso por flag aparece se o plano tem a flag', () => {
    expect(recursoVisivelNoPerfil({ key: 'relatorios', flag: 'ia' }, new Set(), new Set(['ia']), core)).toBe(true)
    expect(recursoVisivelNoPerfil({ key: 'relatorios', flag: 'ia' }, new Set(), new Set(), core)).toBe(false)
  })
  it('nada bate → esconde', () => {
    expect(recursoVisivelNoPerfil({ key: 'xpto' }, new Set(['checklists']), null, core)).toBe(false)
  })
})

describe('resolverAcoesRelatorios', () => {
  it('admin_sistema tem tudo', () => {
    expect(resolverAcoesRelatorios({ isAdminSistema: true, isAdminEmpresa: false, permissoes: [] })).toEqual({
      criar: true, editar: true, excluir: true, executar: true,
    })
  })
  it('admin_empresa tem tudo', () => {
    expect(resolverAcoesRelatorios({ isAdminSistema: false, isAdminEmpresa: true, permissoes: [] })).toEqual({
      criar: true, editar: true, excluir: true, executar: true,
    })
  })
  it('usuário comum: só o que tem no perfil', () => {
    const r = resolverAcoesRelatorios({
      isAdminSistema: false, isAdminEmpresa: false,
      permissoes: [
        { recurso: 'relatorios', acao: 'executar' },
        { recurso: 'checklists', acao: 'criar' }, // não é do recurso relatorios
      ],
    })
    expect(r).toEqual({ criar: false, editar: false, excluir: false, executar: true })
  })
  it('usuário sem nenhuma permissão relatorios → tudo falso', () => {
    expect(resolverAcoesRelatorios({ isAdminSistema: false, isAdminEmpresa: false, permissoes: [] })).toEqual({
      criar: false, editar: false, excluir: false, executar: false,
    })
  })
})
