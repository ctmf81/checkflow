// Testes das regras PURAS de entitlement/visibilidade (lib/entitlements/gating):
// gate de menu por plano (recurso-módulo × característica), papéis de admin,
// opt-in (trial), e resolução das 4 ações de 'relatorios'. Espelha o que roda
// no Sidebar, na tela CRUD e no grupo da Home.
import { describe, it, expect } from 'vitest'
import {
  planoLiberaRecurso, planoLiberaFlag, itemVisivelNoMenu, resolverAcoesRelatorios,
  type ContextoAcesso, type ItemGate,
} from '@/lib/entitlements/gating'

// Contexto base: usuário comum, recursos já carregados, sem nada liberado.
function ctx(over: Partial<ContextoAcesso> = {}): ContextoAcesso {
  return {
    isAdminSistema: false,
    isAdminEmpresa: false,
    recursosHabilitados: null,
    flagsHabilitadas: null,
    recursos: new Set<string>(),
    carregado: true,
    ...over,
  }
}

const ITEM_RELATORIOS: ItemGate = { perm: 'relatorios', flag: 'ia' }

describe('planoLiberaRecurso (opt-in)', () => {
  it('null = sem restrição (trial/dev)', () => {
    expect(planoLiberaRecurso(null, 'checklists')).toBe(true)
  })
  it('sem recurso pedido = liberado', () => {
    expect(planoLiberaRecurso(new Set(), undefined)).toBe(true)
  })
  it('plano configurado libera só o que contém', () => {
    expect(planoLiberaRecurso(new Set(['checklists']), 'checklists')).toBe(true)
    expect(planoLiberaRecurso(new Set(['checklists']), 'tarefas')).toBe(false)
  })
})

describe('planoLiberaFlag (opt-in)', () => {
  it('null = sem restrição', () => {
    expect(planoLiberaFlag(null, 'ia')).toBe(true)
  })
  it('sem flag pedida = liberado', () => {
    expect(planoLiberaFlag(new Set(), undefined)).toBe(true)
  })
  it('plano configurado libera só as flags que contém', () => {
    expect(planoLiberaFlag(new Set(['ia']), 'ia')).toBe(true)
    expect(planoLiberaFlag(new Set([]), 'ia')).toBe(false)
  })
})

describe('itemVisivelNoMenu — item Relatórios (perm relatorios + flag ia)', () => {
  it('admin de SISTEMA vê sempre (ignora plano)', () => {
    // plano configurado SEM ia → mesmo assim admin sistema vê
    expect(itemVisivelNoMenu(ITEM_RELATORIOS, ctx({ isAdminSistema: true, flagsHabilitadas: new Set() }))).toBe(true)
  })

  it('plano SEM ia esconde — inclusive para admin da EMPRESA', () => {
    expect(itemVisivelNoMenu(ITEM_RELATORIOS, ctx({ isAdminEmpresa: true, flagsHabilitadas: new Set(['outra']) }))).toBe(false)
  })

  it('admin da empresa COM ia no plano → vê', () => {
    expect(itemVisivelNoMenu(ITEM_RELATORIOS, ctx({ isAdminEmpresa: true, flagsHabilitadas: new Set(['ia']) }))).toBe(true)
  })

  it('trial/opt-in (flags null) → aparece mesmo sem ia marcada', () => {
    expect(itemVisivelNoMenu(ITEM_RELATORIOS, ctx({ isAdminEmpresa: true, flagsHabilitadas: null }))).toBe(true)
    // usuário comum com a permissão também vê no trial
    expect(itemVisivelNoMenu(ITEM_RELATORIOS, ctx({ recursos: new Set(['relatorios']), flagsHabilitadas: null }))).toBe(true)
  })

  it('usuário comum: precisa da permissão no perfil E da ia no plano', () => {
    const comIa = { flagsHabilitadas: new Set(['ia']) }
    // com permissão + ia → vê
    expect(itemVisivelNoMenu(ITEM_RELATORIOS, ctx({ ...comIa, recursos: new Set(['relatorios']) }))).toBe(true)
    // sem a permissão do perfil → não vê (mesmo com ia)
    expect(itemVisivelNoMenu(ITEM_RELATORIOS, ctx({ ...comIa, recursos: new Set() }))).toBe(false)
    // com permissão mas plano SEM ia → não vê
    expect(itemVisivelNoMenu(ITEM_RELATORIOS, ctx({ flagsHabilitadas: new Set(), recursos: new Set(['relatorios']) }))).toBe(false)
  })

  it('não pisca: enquanto os recursos do perfil não carregaram, fica oculto', () => {
    expect(itemVisivelNoMenu(ITEM_RELATORIOS, ctx({ flagsHabilitadas: new Set(['ia']), recursos: new Set(['relatorios']), carregado: false }))).toBe(false)
  })
})

describe('recursos CORE (unidades/perfis/usuarios) nunca gateados por plano', () => {
  it('planoLiberaRecurso: core passa mesmo com plano configurado sem ele', () => {
    const planoFechado = new Set(['turnos']) // plano só com Turnos
    expect(planoLiberaRecurso(planoFechado, 'unidades')).toBe(true)
    expect(planoLiberaRecurso(planoFechado, 'perfis')).toBe(true)
    expect(planoLiberaRecurso(planoFechado, 'usuarios')).toBe(true)
    // módulo não-core segue gateado
    expect(planoLiberaRecurso(planoFechado, 'checklists')).toBe(false)
    expect(planoLiberaRecurso(planoFechado, 'turnos')).toBe(true)
  })

  it('admin da empresa vê Empresa/Perfis/Usuários num plano fechado (só Turnos)', () => {
    const c = ctx({ isAdminEmpresa: true, recursosHabilitados: new Set(['turnos']) })
    expect(itemVisivelNoMenu({ perm: 'unidades' }, c)).toBe(true)  // Empresa
    expect(itemVisivelNoMenu({ perm: 'perfis' }, c)).toBe(true)
    expect(itemVisivelNoMenu({ perm: 'usuarios' }, c)).toBe(true)
    expect(itemVisivelNoMenu({ perm: 'turnos' }, c)).toBe(true)
    // módulo fora do plano continua escondido (admin empresa é limitado ao plano)
    expect(itemVisivelNoMenu({ perm: 'checklists' }, c)).toBe(false)
  })

  it('usuário comum: core respeita a permissão do perfil, não o plano', () => {
    const plano = new Set(['turnos'])
    // tem 'perfis' no perfil → vê Perfis mesmo com plano fechado
    expect(itemVisivelNoMenu({ perm: 'perfis' }, ctx({ recursosHabilitados: plano, recursos: new Set(['perfis']) }))).toBe(true)
    // sem a permissão → não vê
    expect(itemVisivelNoMenu({ perm: 'perfis' }, ctx({ recursosHabilitados: plano, recursos: new Set() }))).toBe(false)
  })
})

describe('itemVisivelNoMenu — itens comuns (regressão)', () => {
  it('módulo simples respeita recurso do plano + permissão do perfil', () => {
    const item: ItemGate = { perm: 'checklists' }
    // plano sem o módulo → escondido
    expect(itemVisivelNoMenu(item, ctx({ recursosHabilitados: new Set(['tarefas']), recursos: new Set(['checklists']) }))).toBe(false)
    // plano com o módulo + permissão → visível
    expect(itemVisivelNoMenu(item, ctx({ recursosHabilitados: new Set(['checklists']), recursos: new Set(['checklists']) }))).toBe(true)
    // plano com o módulo mas SEM permissão do perfil → escondido
    expect(itemVisivelNoMenu(item, ctx({ recursosHabilitados: new Set(['checklists']), recursos: new Set() }))).toBe(false)
  })

  it('item só-admin: usuário comum não vê; admin da empresa vê', () => {
    const item: ItemGate = { admin: true }
    expect(itemVisivelNoMenu(item, ctx())).toBe(false)
    expect(itemVisivelNoMenu(item, ctx({ isAdminEmpresa: true }))).toBe(true)
  })

  it('item sem perm/flag/admin (ex.: Home) é sempre visível', () => {
    expect(itemVisivelNoMenu({}, ctx())).toBe(true)
  })
})

describe('resolverAcoesRelatorios', () => {
  it('admin de sistema → todas as ações', () => {
    expect(resolverAcoesRelatorios({ isAdminSistema: true, isAdminEmpresa: false, permissoes: [] }))
      .toEqual({ criar: true, editar: true, excluir: true, executar: true })
  })
  it('admin da empresa → todas as ações', () => {
    expect(resolverAcoesRelatorios({ isAdminSistema: false, isAdminEmpresa: true, permissoes: [] }))
      .toEqual({ criar: true, editar: true, excluir: true, executar: true })
  })
  it('perfil só com executar → só executa (gera na Home, mas não cria/edita/exclui)', () => {
    expect(resolverAcoesRelatorios({ isAdminSistema: false, isAdminEmpresa: false, permissoes: [{ recurso: 'relatorios', acao: 'executar' }] }))
      .toEqual({ criar: false, editar: false, excluir: false, executar: true })
  })
  it('perfil com criar+editar → só essas', () => {
    expect(resolverAcoesRelatorios({ isAdminSistema: false, isAdminEmpresa: false, permissoes: [
      { recurso: 'relatorios', acao: 'criar' }, { recurso: 'relatorios', acao: 'editar' },
    ] })).toEqual({ criar: true, editar: true, excluir: false, executar: false })
  })
  it('permissões de OUTROS recursos não vazam para relatorios', () => {
    expect(resolverAcoesRelatorios({ isAdminSistema: false, isAdminEmpresa: false, permissoes: [
      { recurso: 'checklists', acao: 'criar' }, { recurso: 'documentos', acao: 'excluir' },
    ] })).toEqual({ criar: false, editar: false, excluir: false, executar: false })
  })
  it('sem permissão nenhuma → tudo falso', () => {
    expect(resolverAcoesRelatorios({ isAdminSistema: false, isAdminEmpresa: false, permissoes: [] }))
      .toEqual({ criar: false, editar: false, excluir: false, executar: false })
  })
})
