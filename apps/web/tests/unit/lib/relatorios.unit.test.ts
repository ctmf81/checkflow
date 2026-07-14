// Testes da lógica pura dos Relatórios por IA (Feature 2):
// montagem do prompt-modelo + compilação das execuções em markdown.
import { describe, it, expect } from 'vitest'
import { montarPromptModelo, rotuloTipo } from '@/lib/relatorios/montarPrompt'
import {
  formatarValorResposta, compilarExecucoesMarkdown, LIMITE_EXECUCOES_DETALHE,
  type ExecucaoCompilar,
} from '@/lib/relatorios/compilarExecucoes'

describe('montarPromptModelo', () => {
  it('inclui o nome do checklist e lista seções/atividades', () => {
    const txt = montarPromptModelo('Abertura de Loja', [
      { nome: 'Limpeza', atividades: [
        { nome: 'Piso limpo?', tipo: 'sim_nao' },
        { nome: 'Temperatura', tipo: 'numero' },
      ] },
      { nome: 'Vazia', atividades: [] },
    ])
    expect(txt).toContain('"Abertura de Loja"')
    expect(txt).toContain('- Limpeza')
    expect(txt).toContain('Piso limpo? (sim/não)')
    expect(txt).toContain('Temperatura (número)')
    // seção sem atividades não aparece
    expect(txt).not.toContain('Vazia')
  })

  it('checklist sem seções ainda gera instrução base', () => {
    const txt = montarPromptModelo('Vazio', [])
    expect(txt).toContain('"Vazio"')
    expect(txt).toContain('não conformes')
    expect(txt).not.toContain('Itens verificados')
  })

  it('rotuloTipo mapeia tipos conhecidos e devolve o cru para desconhecido', () => {
    expect(rotuloTipo('sim_nao')).toBe('sim/não')
    expect(rotuloTipo('numero')).toBe('número')
    expect(rotuloTipo('xpto')).toBe('xpto')
  })
})

describe('formatarValorResposta', () => {
  it('escalares', () => {
    expect(formatarValorResposta('35')).toBe('35')
    expect(formatarValorResposta(true)).toBe('sim')
    expect(formatarValorResposta(false)).toBe('não')
    expect(formatarValorResposta(null)).toBe('—')
    expect(formatarValorResposta(undefined)).toBe('—')
  })
  it('desembrulha objeto { valor } (resposta de IA por foto)', () => {
    expect(formatarValorResposta({ valor: '80', foto_ia: 'http://x/y.jpg' })).toBe('80')
    expect(formatarValorResposta({ valor: true })).toBe('sim')
  })
})

describe('compilarExecucoesMarkdown', () => {
  const de = '2026-07-14T00:00:00.000Z'
  const ate = '2026-07-14T12:00:00.000Z'

  it('sem execuções → informa vazio', () => {
    const md = compilarExecucoesMarkdown('CL', 12, de, ate, [])
    expect(md).toContain('Nenhuma execução')
    expect(md).toContain('Total de execuções: 0')
  })

  it('lista não conformidades e conta aprovados/reprovados', () => {
    const execs: ExecucaoCompilar[] = [
      { data_execucao: '2026-07-14T10:00:00.000Z', resultado: 'reprovado', executor_nome: 'Ana',
        respostas: [
          { atividade_nome: 'Piso limpo?', tipo: 'sim_nao', resposta: false, conforme: false },
          { atividade_nome: 'Temperatura', tipo: 'numero', resposta: { valor: '30' }, conforme: true },
        ] },
      { data_execucao: '2026-07-14T11:00:00.000Z', resultado: 'aprovado', executor_nome: 'Beto',
        respostas: [
          { atividade_nome: 'Piso limpo?', tipo: 'sim_nao', resposta: true, conforme: true },
        ] },
    ]
    const md = compilarExecucoesMarkdown('Abertura', 12, de, ate, execs)
    expect(md).toContain('Total de execuções: 2 (aprovadas: 1, reprovadas: 1)')
    expect(md).toContain('Não conformidades:')
    expect(md).toContain('Piso limpo?: não')
    expect(md).toContain('por Beto')
  })

  it('acima do limite, resume só as não conformidades', () => {
    const muitas: ExecucaoCompilar[] = Array.from({ length: LIMITE_EXECUCOES_DETALHE + 5 }, (_, i) => ({
      data_execucao: new Date(2026, 6, 14, 0, i).toISOString(),
      resultado: 'aprovado' as const,
      respostas: [{ atividade_nome: 'Item', tipo: 'texto', resposta: 'ok', conforme: true }],
    }))
    const md = compilarExecucoesMarkdown('CL', 24, de, ate, muitas)
    expect(md).toContain('detalhadas apenas as não conformidades')
    // Não deve listar as respostas conformes (só resumo)
    expect(md).not.toContain('Item: ok')
  })
})
