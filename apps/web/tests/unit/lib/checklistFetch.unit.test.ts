// Testes da lib/checklistFetch.ts — buscarDefinicaoChecklist monta o snapshot
// (ChecklistSnapshot) que pré-cacheia checklists "disponível offline". As
// queries devem espelhar a tela de execução; aqui cobrimos o SHAPE do retorno:
// agrupamento de opções de múltipla escolha por atividade, achatamento dos
// motivos (objeto OU array vindos do embed) e os guards de retorno null.
import { describe, it, expect } from 'vitest'
import { buscarDefinicaoChecklist } from '@/lib/checklistFetch'

// Mock de Supabase por tabela: chains passthrough; .single() e o await direto
// resolvem o resultado configurado para a tabela. Registra a ordem de acesso.
function makeSb(byTable: Record<string, { data: unknown }>) {
  const tablesAccessed: string[] = []
  const sb = {
    from(table: string) {
      tablesAccessed.push(table)
      const result = byTable[table] ?? { data: null }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain
      chain.single = () => Promise.resolve(result)
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej)
      return chain
    },
  }
  return { sb: sb as never, tablesAccessed }
}

const CL = { id: 'cl1', nome: 'Abertura', subgrupo_id: 'sg1' }

describe('buscarDefinicaoChecklist — guards', () => {
  it('retorna null quando o checklist não é encontrado', async () => {
    const { sb, tablesAccessed } = makeSb({ checklists: { data: null } })
    expect(await buscarDefinicaoChecklist(sb, 'cl1', 'uni1')).toBeNull()
    // Curto-circuito: não chega a buscar atividades.
    expect(tablesAccessed).toEqual(['checklists'])
  })

  it('retorna null quando o checklist não tem atividades', async () => {
    const { sb } = makeSb({
      checklists: { data: CL },
      checklist_secoes: { data: [] },
      checklist_atividades: { data: [] },
    })
    expect(await buscarDefinicaoChecklist(sb, 'cl1', 'uni1')).toBeNull()
  })
})

describe('buscarDefinicaoChecklist — shape do snapshot', () => {
  it('agrupa as opções de múltipla escolha por atividade', async () => {
    const atvs = [
      { id: 'a1', tipo: 'multipla_escolha', ordem: 1 },
      { id: 'a2', tipo: 'sim_nao', ordem: 2 },
      { id: 'a3', tipo: 'multipla_escolha', ordem: 3 },
    ]
    const opcoes = [
      { id: 'o1', atividade_id: 'a1', label: 'Sim', ordem: 1 },
      { id: 'o2', atividade_id: 'a1', label: 'Não', ordem: 2 },
      { id: 'o3', atividade_id: 'a3', label: 'Talvez', ordem: 1 },
    ]
    const { sb } = makeSb({
      checklists: { data: CL },
      checklist_secoes: { data: [{ id: 's1', ordem: 1 }] },
      checklist_atividades: { data: atvs },
      checklist_atividade_opcoes: { data: opcoes },
      checklist_nao_execucao_motivos: { data: [] },
    })
    const snap = await buscarDefinicaoChecklist(sb, 'cl1', 'uni1')
    expect(snap?.opcoesMap).toEqual({
      a1: [opcoes[0], opcoes[1]],
      a3: [opcoes[2]],
    })
  })

  it('não busca opções quando não há múltipla escolha (opcoesMap vazio)', async () => {
    const { sb, tablesAccessed } = makeSb({
      checklists: { data: CL },
      checklist_secoes: { data: [] },
      checklist_atividades: { data: [{ id: 'a1', tipo: 'sim_nao', ordem: 1 }] },
      checklist_nao_execucao_motivos: { data: [] },
    })
    const snap = await buscarDefinicaoChecklist(sb, 'cl1', 'uni1')
    expect(snap?.opcoesMap).toEqual({})
    expect(tablesAccessed).not.toContain('checklist_atividade_opcoes')
  })

  it('achata motivos vindos como objeto OU como array do embed, descartando vazios', async () => {
    const { sb } = makeSb({
      checklists: { data: CL },
      checklist_secoes: { data: [] },
      checklist_atividades: { data: [{ id: 'a1', tipo: 'sim_nao', ordem: 1 }] },
      checklist_nao_execucao_motivos: {
        data: [
          { motivo: { id: 'm1', descricao: 'Falta de insumo', tipo: 'externo' } },
          { motivo: [{ id: 'm2', descricao: 'Equipamento parado', tipo: 'interno' }] },
          { motivo: null },
        ],
      },
    })
    const snap = await buscarDefinicaoChecklist(sb, 'cl1', 'uni1')
    expect(snap?.motivos).toEqual([
      { id: 'm1', descricao: 'Falta de insumo', tipo: 'externo' },
      { id: 'm2', descricao: 'Equipamento parado', tipo: 'interno' },
    ])
  })

  it('normaliza seções nulas para [] e carimba cachedAt', async () => {
    const { sb } = makeSb({
      checklists: { data: CL },
      checklist_secoes: { data: null },
      checklist_atividades: { data: [{ id: 'a1', tipo: 'sim_nao', ordem: 1 }] },
      checklist_nao_execucao_motivos: { data: null },
    })
    const snap = await buscarDefinicaoChecklist(sb, 'cl1', 'uni1')
    expect(snap?.secoesData).toEqual([])
    expect(snap?.motivos).toEqual([])
    expect(typeof snap?.cachedAt).toBe('number')
    expect(snap?.cl).toEqual(CL)
  })
})
