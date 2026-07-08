// Testes da lógica pura das Listas de Tarefas (lib/tarefas.ts):
// janela de abertura (data limite OU nº de respostas), visibilidade por
// grupos/subgrupos e janela de edição da instância.
import { describe, it, expect } from 'vitest'
import {
  aberturaAberta, visivelPara, listaDisponivel, liberada, statusTarefa,
  calcularEditavelAte, edicaoExpirada, type ListaVisibilidade,
} from '@/lib/tarefas'

const AGORA = Date.parse('2026-06-18T12:00:00.000Z')
const FUTURO = '2026-06-20T12:00:00.000Z'
const PASSADO = '2026-06-16T12:00:00.000Z'

function lista(over: Partial<ListaVisibilidade> = {}): ListaVisibilidade {
  return {
    abertura_data_limite: null,
    abertura_max_respostas: null,
    total_respostas: 0,
    grupos: [],
    subgrupos: [],
    ...over,
  }
}

describe('aberturaAberta', () => {
  it('aberta quando não há limite de data nem de quantidade', () => {
    expect(aberturaAberta(lista(), AGORA)).toBe(true)
  })

  it('aberta enquanto a data limite está no futuro', () => {
    expect(aberturaAberta(lista({ abertura_data_limite: FUTURO }), AGORA)).toBe(true)
  })

  it('fechada quando a data limite já passou', () => {
    expect(aberturaAberta(lista({ abertura_data_limite: PASSADO }), AGORA)).toBe(false)
  })

  it('aberta enquanto o nº de respostas está abaixo do máximo', () => {
    expect(aberturaAberta(lista({ abertura_max_respostas: 5, total_respostas: 4 }), AGORA)).toBe(true)
  })

  it('fechada quando atingiu o nº máximo de respostas', () => {
    expect(aberturaAberta(lista({ abertura_max_respostas: 5, total_respostas: 5 }), AGORA)).toBe(false)
  })

  it('encerra no que vier primeiro — data ok mas quantidade estourada', () => {
    expect(aberturaAberta(lista({ abertura_data_limite: FUTURO, abertura_max_respostas: 2, total_respostas: 2 }), AGORA)).toBe(false)
  })

  it('encerra no que vier primeiro — quantidade ok mas data passou', () => {
    expect(aberturaAberta(lista({ abertura_data_limite: PASSADO, abertura_max_respostas: 10, total_respostas: 1 }), AGORA)).toBe(false)
  })
})

describe('visivelPara', () => {
  const meusGrupos = new Set(['g1'])
  const meusSubgrupos = new Set(['s1'])

  it('por subgrupo: visível quando há interseção', () => {
    expect(visivelPara(lista({ subgrupos: ['s1', 's9'] }), meusGrupos, meusSubgrupos)).toBe(true)
  })

  it('por subgrupo: invisível sem interseção (mesmo pertencendo ao grupo)', () => {
    expect(visivelPara(lista({ grupos: ['g1'], subgrupos: ['s9'] }), meusGrupos, meusSubgrupos)).toBe(false)
  })

  it('sem subgrupo atribuído: cai para interseção por grupo', () => {
    expect(visivelPara(lista({ grupos: ['g1'] }), meusGrupos, meusSubgrupos)).toBe(true)
  })

  it('sem subgrupo e sem grupo em comum: invisível', () => {
    expect(visivelPara(lista({ grupos: ['g9'] }), meusGrupos, meusSubgrupos)).toBe(false)
  })

  it('lista sem nenhuma atribuição: invisível', () => {
    expect(visivelPara(lista(), meusGrupos, meusSubgrupos)).toBe(false)
  })

  it('admin de sistema vê todas, mesmo sem grupo/subgrupo em comum', () => {
    const vazio = new Set<string>()
    expect(visivelPara(lista({ subgrupos: ['s9'] }), vazio, vazio, true)).toBe(true)
    expect(visivelPara(lista({ grupos: ['g9'] }), vazio, vazio, true)).toBe(true)
    expect(visivelPara(lista(), vazio, vazio, true)).toBe(true)
  })
})

describe('listaDisponivel', () => {
  const meusGrupos = new Set(['g1'])
  const meusSubgrupos = new Set(['s1'])

  it('disponível: aberta E visível', () => {
    expect(listaDisponivel(lista({ subgrupos: ['s1'], abertura_data_limite: FUTURO }), AGORA, meusGrupos, meusSubgrupos)).toBe(true)
  })

  it('indisponível: visível mas janela de abertura fechada', () => {
    expect(listaDisponivel(lista({ subgrupos: ['s1'], abertura_data_limite: PASSADO }), AGORA, meusGrupos, meusSubgrupos)).toBe(false)
  })

  it('indisponível: aberta mas não visível', () => {
    expect(listaDisponivel(lista({ subgrupos: ['s9'] }), AGORA, meusGrupos, meusSubgrupos)).toBe(false)
  })

  it('admin: disponível mesmo sem vínculo, mas respeita a janela de abertura', () => {
    const vazio = new Set<string>()
    expect(listaDisponivel(lista({ subgrupos: ['s9'], abertura_data_limite: FUTURO }), AGORA, vazio, vazio, true)).toBe(true)
    expect(listaDisponivel(lista({ subgrupos: ['s9'], abertura_data_limite: PASSADO }), AGORA, vazio, vazio, true)).toBe(false)
  })
})

describe('liberada (data de liberação / agendamento)', () => {
  it('liberada quando não há data de liberação (imediata)', () => {
    expect(liberada({ liberacao_em: null }, AGORA)).toBe(true)
    expect(liberada({}, AGORA)).toBe(true)
  })
  it('liberada quando a data de liberação já passou', () => {
    expect(liberada({ liberacao_em: PASSADO }, AGORA)).toBe(true)
  })
  it('agendada (não liberada) quando a data de liberação está no futuro', () => {
    expect(liberada({ liberacao_em: FUTURO }, AGORA)).toBe(false)
  })
})

describe('listaDisponivel + liberação', () => {
  const meusGrupos = new Set(['g1'])
  const meusSubgrupos = new Set(['s1'])
  it('indisponível enquanto agendada (liberação no futuro), mesmo visível e aberta', () => {
    expect(listaDisponivel(lista({ subgrupos: ['s1'], liberacao_em: FUTURO }), AGORA, meusGrupos, meusSubgrupos)).toBe(false)
  })
  it('disponível depois da liberação', () => {
    expect(listaDisponivel(lista({ subgrupos: ['s1'], liberacao_em: PASSADO }), AGORA, meusGrupos, meusSubgrupos)).toBe(true)
  })
})

describe('statusTarefa (status derivado p/ a gestão)', () => {
  const base = { status: 'publicada' as const }
  it('rascunho → rascunho', () => {
    expect(statusTarefa({ ...lista(), status: 'rascunho' }, AGORA)).toBe('rascunho')
  })
  it('encerrada → finalizada', () => {
    expect(statusTarefa({ ...lista(), status: 'encerrada' }, AGORA)).toBe('finalizada')
  })
  it('publicada com liberação futura → agendada', () => {
    expect(statusTarefa({ ...lista({ liberacao_em: FUTURO }), ...base }, AGORA)).toBe('agendada')
  })
  it('publicada e liberada com janela aberta → em_execucao', () => {
    expect(statusTarefa({ ...lista({ liberacao_em: PASSADO }), ...base }, AGORA)).toBe('em_execucao')
  })
  it('publicada mas janela de abertura fechada → finalizada', () => {
    expect(statusTarefa({ ...lista({ abertura_data_limite: PASSADO }), ...base }, AGORA)).toBe('finalizada')
  })
})

describe('calcularEditavelAte', () => {
  it('null quando não há janela de edição (sem limite próprio)', () => {
    expect(calcularEditavelAte('2026-06-18T12:00:00.000Z', null)).toBeNull()
  })

  it('soma as horas à abertura', () => {
    expect(calcularEditavelAte('2026-06-18T12:00:00.000Z', 2)).toBe('2026-06-18T14:00:00.000Z')
  })

  it('atravessa o dia corretamente', () => {
    expect(calcularEditavelAte('2026-06-18T23:00:00.000Z', 3)).toBe('2026-06-19T02:00:00.000Z')
  })
})

describe('edicaoExpirada', () => {
  it('nunca expira quando não há prazo (null)', () => {
    expect(edicaoExpirada(null, AGORA)).toBe(false)
  })

  it('não expirou: prazo no futuro', () => {
    expect(edicaoExpirada(FUTURO, AGORA)).toBe(false)
  })

  it('expirou: prazo no passado', () => {
    expect(edicaoExpirada(PASSADO, AGORA)).toBe(true)
  })
})
