// Testa os espelhos de calcularProgresso, listarAtividadesVisiveis e
// calcularResultadoGlobal (lib/checklistEngine.ts) — lógica de
// visibilidade de dependentes (gatilho) e do resultado global
// aprovado/reprovado de uma execução, extraídas de operacao/[id]/page.tsx.
import { describe, it, expect } from 'vitest'
import { calcularProgresso, listarAtividadesVisiveis, calcularResultadoGlobal, type AtividadeMin } from '@/lib/checklistEngine'

function secoesDe(atividades: AtividadeMin[]) {
  return [{ atividades }]
}

describe('dependentes — visibilidade por gatilho', () => {
  const arvore: AtividadeMin[] = [{
    id: 'pai',
    dependentes: [
      { id: 'dep-sim', valor_gatilho: 'sim' },
      { id: 'dep-nao', valor_gatilho: 'nao' },
      { id: 'dep-sempre', valor_gatilho: null }, // sem gatilho → sempre visível
    ],
  }]

  it('dependente fica visível quando a resposta do pai bate com o gatilho', () => {
    const lista = listarAtividadesVisiveis(secoesDe(arvore), { pai: 'sim' })
    const ids = lista.map(a => a.id)
    expect(ids).toContain('dep-sim')
    expect(ids).not.toContain('dep-nao')
    expect(ids).toContain('dep-sempre')
  })

  it('nenhum dependente com gatilho aparece se o pai ainda não foi respondido', () => {
    const lista = listarAtividadesVisiveis(secoesDe(arvore), {})
    const ids = lista.map(a => a.id)
    expect(ids).not.toContain('dep-sim')
    expect(ids).not.toContain('dep-nao')
    expect(ids).toContain('dep-sempre')
  })

  it('gatilho funciona com resposta de múltipla escolha (array)', () => {
    const lista = listarAtividadesVisiveis(secoesDe(arvore), { pai: ['nao', 'outro'] })
    const ids = lista.map(a => a.id)
    expect(ids).toContain('dep-nao')
    expect(ids).not.toContain('dep-sim')
  })

  it('dependentes aninhados só aparecem se a cadeia inteira de gatilhos bater', () => {
    const aninhada: AtividadeMin[] = [{
      id: 'a1',
      dependentes: [{
        id: 'a2', valor_gatilho: 'x',
        dependentes: [{ id: 'a3', valor_gatilho: 'y' }],
      }],
    }]
    // a1='x' (libera a2), a2 não respondida → a3 não aparece
    let lista = listarAtividadesVisiveis(secoesDe(aninhada), { a1: 'x' })
    expect(lista.map(a => a.id)).toEqual(['a1', 'a2'])

    // a1='x', a2='y' → a3 aparece
    lista = listarAtividadesVisiveis(secoesDe(aninhada), { a1: 'x', a2: 'y' })
    expect(lista.map(a => a.id)).toEqual(['a1', 'a2', 'a3'])

    // a1 não bate gatilho → a2 nem aparece, mesmo que a3 "responderia" a2
    lista = listarAtividadesVisiveis(secoesDe(aninhada), { a1: 'outra-coisa' })
    expect(lista.map(a => a.id)).toEqual(['a1'])
  })
})

describe('calcularProgresso — conta só atividades visíveis', () => {
  const arvore: AtividadeMin[] = [
    { id: 'a1', dependentes: [{ id: 'a1-dep', valor_gatilho: 'sim' }] },
    { id: 'a2' },
  ]

  it('sem respostas: conta só as atividades de topo (dependentes ocultos)', () => {
    const { total, respondidas } = calcularProgresso(secoesDe(arvore), {})
    expect(total).toBe(2)
    expect(respondidas).toBe(0)
  })

  it('ao responder o pai com o valor-gatilho, o dependente passa a contar no total', () => {
    const { total, respondidas } = calcularProgresso(secoesDe(arvore), { a1: 'sim' })
    expect(total).toBe(3) // a1, a1-dep, a2
    expect(respondidas).toBe(1) // só a1 respondida
  })

  it('respostas vazias (string vazia / array vazio) não contam como respondidas', () => {
    const { respondidas } = calcularProgresso(secoesDe(arvore), { a1: '', a2: [] })
    expect(respondidas).toBe(0)
  })

  it('todas respondidas → respondidas === total', () => {
    const { total, respondidas } = calcularProgresso(secoesDe(arvore), { a1: 'sim', 'a1-dep': 'ok', a2: 'ok' })
    expect(total).toBe(3)
    expect(respondidas).toBe(3)
  })
})

describe('calcularResultadoGlobal — aprovado/reprovado', () => {
  // calcularValidacao simplificado: 'ok' é conforme, 'ruim' não conforme, demais indeterminado
  function validacao(a: AtividadeMin): boolean | null {
    if (a.resposta === 'ok') return true
    if (a.resposta === 'ruim') return false
    return null
  }

  it('aprovado quando todas as atividades visíveis são conformes', () => {
    const visiveis = listarAtividadesVisiveis(secoesDe([{ id: 'a1' }, { id: 'a2' }]), { a1: 'ok', a2: 'ok' })
    expect(calcularResultadoGlobal(visiveis, validacao)).toBe('aprovado')
  })

  it('reprovado quando QUALQUER atividade visível é não conforme', () => {
    const visiveis = listarAtividadesVisiveis(secoesDe([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]), { a1: 'ok', a2: 'ruim', a3: 'ok' })
    expect(calcularResultadoGlobal(visiveis, validacao)).toBe('reprovado')
  })

  it('atividades indeterminadas (validação null) não reprovam sozinhas', () => {
    const visiveis = listarAtividadesVisiveis(secoesDe([{ id: 'a1' }, { id: 'a2' }]), { a1: 'ok', a2: 'texto-livre' })
    expect(calcularResultadoGlobal(visiveis, validacao)).toBe('aprovado')
  })

  it('reprovação em atividade oculta (gatilho não bateu) não conta — só visíveis entram na lista', () => {
    const arvore: AtividadeMin[] = [{ id: 'pai', dependentes: [{ id: 'dep', valor_gatilho: 'sim' }] }]
    // pai='nao' → dep fica oculto; mesmo que sua resposta fosse 'ruim', não entra na lista de visíveis
    const visiveis = listarAtividadesVisiveis(secoesDe(arvore), { pai: 'nao', dep: 'ruim' })
    expect(visiveis.map(a => a.id)).toEqual(['pai'])
    expect(calcularResultadoGlobal(visiveis, validacao)).toBe('aprovado')
  })
})
