// Testes do motor puro do gerador de demo (lib/demo/gerador.ts):
// determinismo do RNG, distribuição de datas na janela (dias úteis/horário,
// sem futuro) e sorteio de desfechos por pesos.
import { describe, it, expect } from 'vitest'
import {
  criarRng, inteiro, escolher, ehDiaUtil,
  distribuirExecucoes, sortearDatas, distribuirPorBuckets, sortearStatus, sortearDesfecho,
  resultadoDoDesfecho, temPlano, statusPlanoDoDesfecho,
  type Desfecho,
} from '@/lib/demo/gerador'

describe('criarRng', () => {
  it('é determinístico: mesma seed → mesma sequência', () => {
    const a = criarRng(42), b = criarRng(42)
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })
  it('seeds diferentes → sequências diferentes', () => {
    expect(criarRng(1)()).not.toBe(criarRng(2)())
  })
  it('sempre em [0,1)', () => {
    const r = criarRng(7)
    for (let i = 0; i < 200; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
})

describe('inteiro / escolher', () => {
  it('inteiro respeita [min,max] inclusivo', () => {
    const r = criarRng(3)
    for (let i = 0; i < 200; i++) { const v = inteiro(r, 2, 5); expect(v).toBeGreaterThanOrEqual(2); expect(v).toBeLessThanOrEqual(5); expect(Number.isInteger(v)).toBe(true) }
  })
  it('inteiro com min==max retorna o valor', () => {
    expect(inteiro(criarRng(1), 4, 4)).toBe(4)
  })
  it('escolher sempre retorna um item do array', () => {
    const itens = ['a', 'b', 'c'] as const
    const r = criarRng(9)
    for (let i = 0; i < 50; i++) expect(itens).toContain(escolher(r, itens))
  })
})

describe('ehDiaUtil', () => {
  it('seg–sex = true, sáb/dom = false', () => {
    // 2026-07-27 é uma segunda-feira
    expect(ehDiaUtil(new Date(2026, 6, 27))).toBe(true) // seg
    expect(ehDiaUtil(new Date(2026, 6, 31))).toBe(true) // sex
    expect(ehDiaUtil(new Date(2026, 7, 1))).toBe(false) // sáb
    expect(ehDiaUtil(new Date(2026, 7, 2))).toBe(false) // dom
  })
})

describe('distribuirExecucoes', () => {
  const agora = new Date(2026, 6, 30, 14, 0, 0) // qui 2026-07-30 14:00
  const cfg = { agora, dias: 30, porDiaMin: 2, porDiaMax: 4, horaInicio: 8, horaFim: 18 }

  it('gera datas ordenadas, só em dias úteis e no horário', () => {
    const datas = distribuirExecucoes(cfg, criarRng(123))
    expect(datas.length).toBeGreaterThan(0)
    for (let i = 1; i < datas.length; i++) expect(datas[i].getTime()).toBeGreaterThanOrEqual(datas[i - 1].getTime())
    for (const d of datas) {
      expect(ehDiaUtil(d)).toBe(true)
      expect(d.getHours()).toBeGreaterThanOrEqual(8)
      expect(d.getHours()).toBeLessThan(18)
    }
  })
  it('nunca gera no futuro nem antes da janela', () => {
    const datas = distribuirExecucoes(cfg, criarRng(555))
    const limiteInf = new Date(agora); limiteInf.setDate(limiteInf.getDate() - 30); limiteInf.setHours(0, 0, 0, 0)
    for (const d of datas) {
      expect(d.getTime()).toBeLessThanOrEqual(agora.getTime())
      expect(d.getTime()).toBeGreaterThanOrEqual(limiteInf.getTime())
    }
  })
  it('é determinístico', () => {
    const a = distribuirExecucoes(cfg, criarRng(1)).map(d => d.getTime())
    const b = distribuirExecucoes(cfg, criarRng(1)).map(d => d.getTime())
    expect(a).toEqual(b)
  })
})

describe('sortearDatas', () => {
  const agora = new Date(2026, 6, 30, 14, 0, 0) // qui 2026-07-30 14:00

  it('gera exatamente N datas, em dias úteis, no passado (exclui hoje)', () => {
    const datas = sortearDatas(agora, 30, 80, 8, 18, criarRng(1))
    expect(datas).toHaveLength(80)
    const hoje0 = new Date(agora); hoje0.setHours(0, 0, 0, 0)
    for (const d of datas) {
      expect(ehDiaUtil(d)).toBe(true)
      expect(d.getHours()).toBeGreaterThanOrEqual(8)
      expect(d.getHours()).toBeLessThan(18)
      expect(d.getTime()).toBeLessThan(hoje0.getTime()) // antes de hoje → nunca futuro
    }
  })
  it('vem ordenado e é determinístico', () => {
    const a = sortearDatas(agora, 30, 40, 8, 18, criarRng(9)).map(d => d.getTime())
    const b = sortearDatas(agora, 30, 40, 8, 18, criarRng(9)).map(d => d.getTime())
    expect(a).toEqual(b)
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThanOrEqual(a[i - 1])
  })
})

describe('sortearStatus', () => {
  it('cobre os 3 status, com maioria concluído', () => {
    const r = criarRng(3)
    const cont: Record<string, number> = {}
    for (let i = 0; i < 3000; i++) { const s = sortearStatus(r); cont[s] = (cont[s] ?? 0) + 1 }
    expect(cont.concluido).toBeGreaterThan(cont.em_andamento ?? 0)
    expect(cont.concluido).toBeGreaterThan(cont.nao_executado ?? 0)
    expect(cont.em_andamento ?? 0).toBeGreaterThan(0)
    expect(cont.nao_executado ?? 0).toBeGreaterThan(0)
    expect(cont.concluido / 3000).toBeGreaterThan(0.7)
  })
})

describe('sortearDesfecho', () => {
  it('respeita aproximadamente os pesos', () => {
    const r = criarRng(2026)
    const pesos = { aprovada: 70, reprovada_sem_plano: 10, plano_aberto_n1: 20 }
    const cont: Record<string, number> = {}
    for (let i = 0; i < 4000; i++) { const d = sortearDesfecho(r, pesos); cont[d] = (cont[d] ?? 0) + 1 }
    expect(cont.aprovada).toBeGreaterThan(cont.plano_aberto_n1)
    expect(cont.plano_aberto_n1).toBeGreaterThan(cont.reprovada_sem_plano ?? 0)
    expect(cont.aprovada / 4000).toBeGreaterThan(0.6)
    expect(cont.aprovada / 4000).toBeLessThan(0.8)
  })
  it('ignora pesos ausentes/zero e nunca os sorteia', () => {
    const r = criarRng(5)
    for (let i = 0; i < 500; i++) expect(sortearDesfecho(r, { aprovada: 1, plano_corrigido: 0 })).toBe('aprovada')
  })
  it('pesos vazios → aprovada', () => {
    expect(sortearDesfecho(criarRng(1), {})).toBe('aprovada')
  })
})

describe('mapeamento de desfecho', () => {
  it('resultadoDoDesfecho', () => {
    expect(resultadoDoDesfecho('aprovada')).toBe('aprovado')
    for (const d of ['reprovada_sem_plano', 'plano_aberto_n1', 'plano_aberto_n2', 'plano_corrigido', 'plano_nao_corrigido'] as Desfecho[]) {
      expect(resultadoDoDesfecho(d)).toBe('reprovado')
    }
  })
  it('temPlano só para desfechos plano_*', () => {
    expect(temPlano('aprovada')).toBe(false)
    expect(temPlano('reprovada_sem_plano')).toBe(false)
    expect(temPlano('plano_aberto_n1')).toBe(true)
    expect(temPlano('plano_corrigido')).toBe(true)
  })
  it('statusPlanoDoDesfecho mapeia para o check da tabela', () => {
    expect(statusPlanoDoDesfecho('plano_aberto_n1')).toBe('em_moderacao_n1')
    expect(statusPlanoDoDesfecho('plano_aberto_n2')).toBe('em_moderacao_n2')
    expect(statusPlanoDoDesfecho('plano_corrigido')).toBe('corrigido')
    expect(statusPlanoDoDesfecho('plano_nao_corrigido')).toBe('nao_corrigido')
    expect(statusPlanoDoDesfecho('aprovada')).toBeNull()
    expect(statusPlanoDoDesfecho('reprovada_sem_plano')).toBeNull()
  })
})

describe('distribuirPorBuckets', () => {
  const HORA = 60 * 60 * 1000
  const DIA = 24 * HORA
  const agora = new Date('2026-08-03T15:00:00Z')

  function contarPorBucket(datas: Date[]) {
    let b1h = 0, b6h = 0, b12h = 0, b24h = 0, b15d = 0, b30d = 0
    for (const d of datas) {
      const atras = agora.getTime() - d.getTime()
      if (atras < HORA) b1h++
      else if (atras < 6 * HORA) b6h++
      else if (atras < 12 * HORA) b12h++
      else if (atras < 24 * HORA) b24h++
      else if (atras < 15 * DIA) b15d++
      else if (atras <= 30 * DIA) b30d++
    }
    return { b1h, b6h, b12h, b24h, b15d, b30d }
  }

  it('devolve exatamente `total` timestamps', () => {
    const datas = distribuirPorBuckets(agora, 80, criarRng(1))
    expect(datas).toHaveLength(80)
  })

  it('distribui 80 entre os 6 buckets (14/14/13/13/13/13 disjuntos)', () => {
    const c = contarPorBucket(distribuirPorBuckets(agora, 80, criarRng(1)))
    expect(c).toEqual({ b1h: 14, b6h: 14, b12h: 13, b24h: 13, b15d: 13, b30d: 13 })
  })

  it('cumulativo cresce em cada corte do funil', () => {
    const c = contarPorBucket(distribuirPorBuckets(agora, 80, criarRng(2)))
    const cum1h = c.b1h
    const cum6h = cum1h + c.b6h
    const cum12h = cum6h + c.b12h
    const cum24h = cum12h + c.b24h
    const cum15d = cum24h + c.b15d
    const cum30d = cum15d + c.b30d
    expect(cum1h).toBeGreaterThan(0)
    expect(cum6h).toBeGreaterThan(cum1h)
    expect(cum24h).toBeGreaterThan(cum12h)
    expect(cum30d).toBe(80)
  })

  it('nenhum timestamp no futuro; todos dentro de 30 dias', () => {
    const datas = distribuirPorBuckets(agora, 80, criarRng(3))
    for (const d of datas) {
      expect(d.getTime()).toBeLessThanOrEqual(agora.getTime())
      expect(agora.getTime() - d.getTime()).toBeLessThanOrEqual(30 * DIA)
    }
  })

  it('retornado ordenado do mais antigo ao mais recente', () => {
    const datas = distribuirPorBuckets(agora, 80, criarRng(4))
    for (let i = 1; i < datas.length; i++) {
      expect(datas[i].getTime()).toBeGreaterThanOrEqual(datas[i - 1].getTime())
    }
  })
})
