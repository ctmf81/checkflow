// Testes do mapeamento puro de respostas (lib/demo/respostas.ts).
import { describe, it, expect } from 'vitest'
import { criarRng } from '@/lib/demo/gerador'
import { atividadeValida, configAtividade, gerarResposta } from '@/lib/demo/respostas'
import type { AtividadeTemplate } from '@/lib/demo/tipos'

const simNao: AtividadeTemplate = { nome: 'ok?', tipo: 'sim_nao', simConforme: 'sim' }
const simNaoInvertido: AtividadeTemplate = { nome: 'corpo estranho', tipo: 'sim_nao', simConforme: 'nao' }
const numero: AtividadeTemplate = { nome: 'temp', tipo: 'numero', faixa: { min: 150, max: 200, unidade: 'ppm' } }
const multipla: AtividadeTemplate = { nome: 'aspecto', tipo: 'multipla_escolha', opcoes: ['Conforme', 'Descolorido', 'Deformado'], opcoesConformes: ['Conforme'] }
const catalogo: AtividadeTemplate = { nome: 'câmara', tipo: 'catalogo', catalogo: 'Câmaras Frias' }
const texto: AtividadeTemplate = { nome: 'placa', tipo: 'texto', valores: ['ABC1D23'] }

describe('atividadeValida', () => {
  it('sim_nao/numero/multipla validam; texto/catalogo não', () => {
    expect([simNao, numero, multipla].every(atividadeValida)).toBe(true)
    expect([texto, catalogo].some(atividadeValida)).toBe(false)
  })
})

describe('configAtividade', () => {
  it('sim_nao → esperado', () => expect(configAtividade(simNaoInvertido)).toEqual({ esperado: 'nao' }))
  it('sim_nao default esperado sim', () => expect(configAtividade(simNao)).toEqual({ esperado: 'sim' }))
  it('numero → min/max/unidade', () => expect(configAtividade(numero)).toEqual({ min: 150, max: 200, unidade: 'ppm' }))
  it('catalogo → catalogo_id quando resolvido', () => expect(configAtividade(catalogo, 'cat-1')).toEqual({ catalogo_id: 'cat-1' }))
  it('catalogo sem id → vazio', () => expect(configAtividade(catalogo)).toEqual({}))
})

describe('gerarResposta — conforme vs não conforme', () => {
  const rng = () => criarRng(11)

  it('sim_nao conforme = resposta esperada; não conforme = oposta', () => {
    expect(gerarResposta(simNao, true, rng())).toEqual({ resposta: { valor: 'sim' }, conforme: true })
    expect(gerarResposta(simNao, false, rng())).toEqual({ resposta: { valor: 'nao' }, conforme: false })
    // simConforme 'nao' inverte
    expect(gerarResposta(simNaoInvertido, true, rng())).toEqual({ resposta: { valor: 'nao' }, conforme: true })
    expect(gerarResposta(simNaoInvertido, false, rng())).toEqual({ resposta: { valor: 'sim' }, conforme: false })
  })

  it('numero conforme cai na faixa; não conforme fica fora', () => {
    for (let i = 0; i < 50; i++) {
      const r = criarRng(i)
      const ok = gerarResposta(numero, true, r) as { resposta: { valor: number }; conforme: boolean }
      expect(ok.resposta.valor).toBeGreaterThanOrEqual(150)
      expect(ok.resposta.valor).toBeLessThanOrEqual(200)
      expect(ok.conforme).toBe(true)
      const bad = gerarResposta(numero, false, r) as { resposta: { valor: number } }
      expect(bad.resposta.valor < 150 || bad.resposta.valor > 200).toBe(true)
    }
  })

  it('multipla conforme escolhe opção conforme; não conforme escolhe outra', () => {
    for (let i = 0; i < 50; i++) {
      const r = criarRng(i + 100)
      const ok = gerarResposta(multipla, true, r) as { resposta: { valor: string } }
      expect(multipla.opcoesConformes).toContain(ok.resposta.valor)
      const bad = gerarResposta(multipla, false, r) as { resposta: { valor: string } }
      expect(multipla.opcoesConformes).not.toContain(bad.resposta.valor)
      expect(multipla.opcoes).toContain(bad.resposta.valor)
    }
  })

  it('catalogo usa a chave e conforme=null', () => {
    const r = gerarResposta(catalogo, true, criarRng(1), ['CF-01', 'CF-02'])
    expect(['CF-01', 'CF-02']).toContain((r.resposta as { valor_chave: string }).valor_chave)
    expect(r.conforme).toBeNull()
  })

  it('texto usa um valor do pool e conforme=null', () => {
    const r = gerarResposta(texto, true, criarRng(1))
    expect((r.resposta as { valor: string }).valor).toBe('ABC1D23')
    expect(r.conforme).toBeNull()
  })
})
