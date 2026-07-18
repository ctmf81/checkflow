// Testes da lógica pura dos Indicadores de Tarefas (lib/tarefaIndicadores.ts):
// feito × não-feito por tarefa, conclusão média, e extração de evidências/pontos.
import { describe, it, expect } from 'vitest'
import {
  statsPorItem, conclusaoMediaPct, feitosDaExecucao, itemFeitoNaExecucao,
  extrairEvidencias, extrairPontos,
  type ExecucaoInd, type ItemInd, type RespostaInd,
} from '@/lib/tarefaIndicadores'

const itens: ItemInd[] = [
  { id: 'i1', titulo: 'Tarefa 1', ordem: 0 },
  { id: 'i2', titulo: 'Tarefa 2', ordem: 1 },
]

function resp(over: Partial<RespostaInd> & { item_id: string }): RespostaInd {
  return { feito: false, ...over }
}
function exec(nome: string, respostas: RespostaInd[], over: Partial<ExecucaoInd> = {}): ExecucaoInd {
  return { id: nome, nome, status: 'em_andamento', aberta_em: '2026-07-17T10:00:00Z', respostas, ...over }
}

describe('itemFeitoNaExecucao', () => {
  it('true só quando existe resposta feita para o item', () => {
    const e = exec('A', [resp({ item_id: 'i1', feito: true }), resp({ item_id: 'i2', feito: false })])
    expect(itemFeitoNaExecucao(e, 'i1')).toBe(true)
    expect(itemFeitoNaExecucao(e, 'i2')).toBe(false)
    expect(itemFeitoNaExecucao(e, 'i3')).toBe(false) // sem resposta = não feito
  })
})

describe('statsPorItem', () => {
  it('conta feito × não-feito com denominador = nº de execuções', () => {
    const execs = [
      exec('A', [resp({ item_id: 'i1', feito: true }), resp({ item_id: 'i2', feito: true })]),
      exec('B', [resp({ item_id: 'i1', feito: true })]), // i2 sem resposta → não feito
    ]
    const s = statsPorItem(itens, execs)
    expect(s).toEqual([
      { id: 'i1', titulo: 'Tarefa 1', feito: 2, naoFeito: 0, total: 2 },
      { id: 'i2', titulo: 'Tarefa 2', feito: 1, naoFeito: 1, total: 2 },
    ])
  })

  it('sem execuções: tudo zero', () => {
    const s = statsPorItem(itens, [])
    expect(s.every(x => x.feito === 0 && x.total === 0 && x.naoFeito === 0)).toBe(true)
  })
})

describe('conclusaoMediaPct', () => {
  it('média das pessoas (feitos/total) em %', () => {
    const execs = [
      exec('A', [resp({ item_id: 'i1', feito: true }), resp({ item_id: 'i2', feito: true })]), // 100%
      exec('B', [resp({ item_id: 'i1', feito: true })]),                                        // 50%
    ]
    expect(conclusaoMediaPct(itens, execs)).toBe(75)
  })

  it('0 quando não há execuções ou não há itens', () => {
    expect(conclusaoMediaPct(itens, [])).toBe(0)
    expect(conclusaoMediaPct([], [exec('A', [])])).toBe(0)
  })

  it('arredonda (1 de 3 itens = 33%)', () => {
    const tres: ItemInd[] = [{ id: 'a', titulo: 'a' }, { id: 'b', titulo: 'b' }, { id: 'c', titulo: 'c' }]
    const execs = [exec('A', [resp({ item_id: 'a', feito: true })])]
    expect(conclusaoMediaPct(tres, execs)).toBe(33)
  })
})

describe('feitosDaExecucao', () => {
  it('conta itens feitos daquela pessoa', () => {
    const e = exec('A', [resp({ item_id: 'i1', feito: true }), resp({ item_id: 'i2', feito: false })])
    expect(feitosDaExecucao(itens, e)).toBe(1)
  })
})

describe('extrairEvidencias', () => {
  const titulo = new Map([['i1', 'Tarefa 1'], ['i2', 'Tarefa 2']])
  it('achata só respostas com evidência, com autor e nome do item', () => {
    const execs = [
      exec('Ana', [resp({ item_id: 'i1', feito: true, evidencia_url: 'u1', evidencia_tipo: 'foto' })]),
      exec('Bia', [resp({ item_id: 'i2', feito: true, evidencia_url: 'u2', evidencia_tipo: 'video', lat: 1, lng: 2 })]),
      exec('Cid', [resp({ item_id: 'i1', feito: true })]), // sem evidência → fora
    ]
    const ev = extrairEvidencias(execs, titulo)
    expect(ev).toHaveLength(2)
    expect(ev[0]).toMatchObject({ url: 'u1', tipo: 'foto', pessoa: 'Ana', item: 'Tarefa 1' })
    expect(ev[1]).toMatchObject({ url: 'u2', tipo: 'video', pessoa: 'Bia', item: 'Tarefa 2', lat: 1, lng: 2 })
  })
  it('tipo default = foto quando ausente; item desconhecido vira "Item"', () => {
    const execs = [exec('Ana', [resp({ item_id: 'x', feito: true, evidencia_url: 'u' })])]
    const ev = extrairEvidencias(execs, titulo)
    expect(ev[0]).toMatchObject({ tipo: 'foto', item: 'Item' })
  })
})

describe('extrairPontos', () => {
  const titulo = new Map([['i1', 'Tarefa 1']])
  it('só respostas com lat E lng não nulos', () => {
    const execs = [
      exec('Ana', [resp({ item_id: 'i1', feito: true, lat: -9.6, lng: -35.7 })]),
      exec('Bia', [resp({ item_id: 'i1', feito: true, lat: null, lng: null })]),
      exec('Cid', [resp({ item_id: 'i1', feito: true, lat: 5 })]), // lng nulo → fora
    ]
    const p = extrairPontos(execs, titulo)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ lat: -9.6, lng: -35.7, pessoa: 'Ana', item: 'Tarefa 1' })
  })
  it('lat 0 / lng 0 são válidos (não nulos)', () => {
    const execs = [exec('Ana', [resp({ item_id: 'i1', feito: true, lat: 0, lng: 0 })])]
    expect(extrairPontos(execs, titulo)).toHaveLength(1)
  })
})
