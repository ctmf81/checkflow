// Testes do motor puro do gerador de demo (lib/demo/gerador.ts):
// determinismo do RNG, distribuição de datas na janela (dias úteis/horário,
// sem futuro) e sorteio de desfechos por pesos.
import { describe, it, expect } from 'vitest'
import {
  criarRng, inteiro, escolher, ehDiaUtil,
  distribuirExecucoes, sortearDesfecho,
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
