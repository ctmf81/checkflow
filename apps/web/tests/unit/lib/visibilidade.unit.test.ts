/**
 * Testes unitários da visibilidade por subgrupo (lib/visibilidade.ts).
 *
 * Regra transversal do produto: cada usuário só vê o que pertence aos seus
 * subgrupos; o admin de sistema vê tudo. Espelha os filtros de exibição da
 * Operação (operacao/page.tsx) e da gestão de Agendamentos (agendamentos/page.tsx).
 *
 * MANTENHA EM SINCRONIA com esses dois componentes (fonte única de verdade).
 */

import { describe, it, expect } from 'vitest'
import {
  visivelPorSubgrupo,
  checklistVisivelOperador,
  agendamentoVisivelGestor,
  documentoVisivelOperador,
} from '../../../lib/visibilidade'

// ─── Predicado base ─────────────────────────────────────────────────────────────

describe('visivelPorSubgrupo() — predicado base', () => {
  const meus = new Set(['sg-1', 'sg-2'])

  it('admin vê qualquer subgrupo, inclusive nulo', () => {
    expect(visivelPorSubgrupo('sg-99', { isAdmin: true, meusSubgrupos: new Set() })).toBe(true)
    expect(visivelPorSubgrupo(null, { isAdmin: true, meusSubgrupos: new Set() })).toBe(true)
  })

  it('não-admin vê subgrupo do qual participa', () => {
    expect(visivelPorSubgrupo('sg-1', { isAdmin: false, meusSubgrupos: meus })).toBe(true)
  })

  it('não-admin NÃO vê subgrupo de fora', () => {
    expect(visivelPorSubgrupo('sg-9', { isAdmin: false, meusSubgrupos: meus })).toBe(false)
  })

  it('não-admin NÃO vê registro sem subgrupo (nulo/undefined)', () => {
    expect(visivelPorSubgrupo(null, { isAdmin: false, meusSubgrupos: meus })).toBe(false)
    expect(visivelPorSubgrupo(undefined, { isAdmin: false, meusSubgrupos: meus })).toBe(false)
  })

  it('não-admin sem subgrupos não vê nada', () => {
    expect(visivelPorSubgrupo('sg-1', { isAdmin: false, meusSubgrupos: new Set() })).toBe(false)
  })
})

// ─── Operação: checklists avulsos ───────────────────────────────────────────────

describe('checklistVisivelOperador() — lista avulsa da Operação', () => {
  const ctx = { isAdmin: false, meusSubgrupos: new Set(['sg-1']) }
  const semWorkflow = new Set<string>()

  it('checklist do meu subgrupo e fora de workflow → visível', () => {
    expect(checklistVisivelOperador({ id: 'c1', subgrupo_id: 'sg-1' }, ctx, semWorkflow)).toBe(true)
  })

  it('checklist de outro subgrupo → invisível', () => {
    expect(checklistVisivelOperador({ id: 'c1', subgrupo_id: 'sg-9' }, ctx, semWorkflow)).toBe(false)
  })

  it('checklist do meu subgrupo mas EM workflow → invisível (evita porta-dupla)', () => {
    const emWf = new Set(['c1'])
    expect(checklistVisivelOperador({ id: 'c1', subgrupo_id: 'sg-1' }, ctx, emWf)).toBe(false)
  })

  it('admin vê todos os checklists fora de workflow', () => {
    const admin = { isAdmin: true, meusSubgrupos: new Set<string>() }
    expect(checklistVisivelOperador({ id: 'c1', subgrupo_id: 'sg-9' }, admin, semWorkflow)).toBe(true)
  })

  it('admin NÃO vê na lista avulsa um checklist que está em workflow', () => {
    const admin = { isAdmin: true, meusSubgrupos: new Set<string>() }
    expect(checklistVisivelOperador({ id: 'c1', subgrupo_id: 'sg-9' }, admin, new Set(['c1']))).toBe(false)
  })

  it('checklist sem subgrupo (geral) → invisível para operador comum', () => {
    expect(checklistVisivelOperador({ id: 'c1', subgrupo_id: null }, ctx, semWorkflow)).toBe(false)
  })
})

// ─── Agendamentos (gestão) ──────────────────────────────────────────────────────

describe('agendamentoVisivelGestor() — listagem de Agendamentos', () => {
  const ctx = { isAdmin: false, meusSubgrupos: new Set(['sg-1']) }

  it('admin vê todos os agendamentos', () => {
    const admin = { isAdmin: true, meusSubgrupos: new Set<string>() }
    expect(agendamentoVisivelGestor(
      { tipo_alvo: 'checklist', workflow_id: null, checklist_subgrupo_id: 'sg-9' }, admin, {},
    )).toBe(true)
  })

  describe('alvo = checklist', () => {
    it('checklist do meu subgrupo → visível', () => {
      expect(agendamentoVisivelGestor(
        { tipo_alvo: 'checklist', workflow_id: null, checklist_subgrupo_id: 'sg-1' }, ctx, {},
      )).toBe(true)
    })
    it('checklist de outro subgrupo → invisível', () => {
      expect(agendamentoVisivelGestor(
        { tipo_alvo: 'checklist', workflow_id: null, checklist_subgrupo_id: 'sg-9' }, ctx, {},
      )).toBe(false)
    })
    it('checklist sem subgrupo → invisível', () => {
      expect(agendamentoVisivelGestor(
        { tipo_alvo: 'checklist', workflow_id: null, checklist_subgrupo_id: null }, ctx, {},
      )).toBe(false)
    })
  })

  describe('alvo = workflow', () => {
    it('workflow com ALGUM item no meu subgrupo → visível', () => {
      const wfSubs = { 'wf-1': new Set(['sg-9', 'sg-1']) }
      expect(agendamentoVisivelGestor(
        { tipo_alvo: 'workflow', workflow_id: 'wf-1', checklist_subgrupo_id: null }, ctx, wfSubs,
      )).toBe(true)
    })
    it('workflow só com itens de outros subgrupos → invisível', () => {
      const wfSubs = { 'wf-1': new Set(['sg-8', 'sg-9']) }
      expect(agendamentoVisivelGestor(
        { tipo_alvo: 'workflow', workflow_id: 'wf-1', checklist_subgrupo_id: null }, ctx, wfSubs,
      )).toBe(false)
    })
    it('workflow sem mapa de subgrupos → invisível', () => {
      expect(agendamentoVisivelGestor(
        { tipo_alvo: 'workflow', workflow_id: 'wf-1', checklist_subgrupo_id: null }, ctx, {},
      )).toBe(false)
    })
    it('workflow_id nulo → invisível', () => {
      expect(agendamentoVisivelGestor(
        { tipo_alvo: 'workflow', workflow_id: null, checklist_subgrupo_id: null }, ctx, {},
      )).toBe(false)
    })
  })
})

// ─── Documentos (operação) ──────────────────────────────────────────────────────

describe('documentoVisivelOperador()', () => {
  const ctx = { isAdmin: false, meusGrupos: new Set(['g-1']), meusSubgrupos: new Set(['sg-1']) }

  it('documento do meu subgrupo → visível', () => {
    expect(documentoVisivelOperador({ subgrupo_id: 'sg-1', grupo_id: 'g-9' }, ctx)).toBe(true)
  })
  it('documento do meu grupo (sem subgrupo) → visível', () => {
    expect(documentoVisivelOperador({ subgrupo_id: null, grupo_id: 'g-1' }, ctx)).toBe(true)
  })
  it('documento geral (sem grupo nem subgrupo) → visível p/ todos', () => {
    expect(documentoVisivelOperador({ subgrupo_id: null, grupo_id: null }, ctx)).toBe(true)
  })
  it('documento de outro subgrupo+grupo → invisível', () => {
    expect(documentoVisivelOperador({ subgrupo_id: 'sg-9', grupo_id: 'g-9' }, ctx)).toBe(false)
  })
  it('subgrupo de fora mas grupo meu → visível (cai p/ grupo)', () => {
    expect(documentoVisivelOperador({ subgrupo_id: 'sg-9', grupo_id: 'g-1' }, ctx)).toBe(true)
  })
  it('admin vê qualquer documento', () => {
    const admin = { isAdmin: true, meusGrupos: new Set<string>(), meusSubgrupos: new Set<string>() }
    expect(documentoVisivelOperador({ subgrupo_id: 'sg-9', grupo_id: 'g-9' }, admin)).toBe(true)
  })
})
