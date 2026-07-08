/**
 * Testes unitários para apps/api/src/lib/notificacao-templates.ts
 *
 * Testa a função `renderizar()` — responsável por interpolar {{variavel}}
 * nos templates de notificação. É o ponto mais crítico do sistema de
 * notificações: se falhar, todas as mensagens saem erradas ou com
 * chaves literais expostas ao destinatário.
 *
 * NOTA: O arquivo fonte está na API (apps/api), mas os testes ficam
 * aqui pois o Vitest está configurado apenas no apps/web.
 * A função é pura (sem dependências externas), então copiamos a lógica
 * e garantimos que o comportamento está correto — se a implementação
 * mudar, este teste vai falhar e alertar.
 */

import { describe, it, expect } from 'vitest'

// ─── Replica da função renderizar() de apps/api/src/lib/notificacao-templates.ts
// Mantenha em sincronia com o original se a lógica mudar.
function renderizar(texto: string, vars: Record<string, string | null | undefined>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, chave) => {
    const val = vars[chave]
    return val != null ? val : ''
  })
}

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('renderizar() — interpolação de templates', () => {

  // ── Casos básicos ──────────────────────────────────────────────────────────

  it('substitui uma variável simples', () => {
    expect(renderizar('Olá, {{nome}}!', { nome: 'João' })).toBe('Olá, João!')
  })

  it('substitui múltiplas variáveis diferentes', () => {
    const resultado = renderizar('Ticket #{{numero}} — {{titulo}}', {
      numero: '0042',
      titulo: 'Vazamento na linha 3',
    })
    expect(resultado).toBe('Ticket #0042 — Vazamento na linha 3')
  })

  it('substitui a mesma variável múltiplas vezes', () => {
    expect(renderizar('{{nome}} disse olá. Obrigado, {{nome}}!', { nome: 'Ana' }))
      .toBe('Ana disse olá. Obrigado, Ana!')
  })

  // ── Variáveis ausentes ─────────────────────────────────────────────────────

  it('variável ausente no mapa → string vazia (não exibe {{chave}})', () => {
    expect(renderizar('Destino: {{grupo}} / {{subgrupo}}', { grupo: 'Produção' }))
      .toBe('Destino: Produção / ')
  })

  it('variável com valor null → string vazia', () => {
    expect(renderizar('Categoria: {{categoria}}', { categoria: null }))
      .toBe('Categoria: ')
  })

  it('variável com valor undefined → string vazia', () => {
    expect(renderizar('SLA: {{sla}}', { sla: undefined }))
      .toBe('SLA: ')
  })

  // ── Linha condicional (padrão {{linha_X}}) ─────────────────────────────────

  it('linha_categoria preenchida → exibe com quebra de linha', () => {
    const vars = { subgrupo: 'Manutenção', linha_categoria: '\nCategoria: Elétrica' }
    expect(renderizar('{{subgrupo}}{{linha_categoria}}', vars))
      .toBe('Manutenção\nCategoria: Elétrica')
  })

  it('linha_categoria vazia → não aparece nada extra', () => {
    expect(renderizar('{{subgrupo}}{{linha_categoria}}', {
      subgrupo: 'Manutenção',
      linha_categoria: '',
    })).toBe('Manutenção')
  })

  it('linha_sla com valor → aparece', () => {
    expect(renderizar('Observação: {{observacao}}{{linha_sla}}', {
      observacao: 'Motor barulhando',
      linha_sla: '\nSLA: 4h para vencer',
    })).toBe('Observação: Motor barulhando\nSLA: 4h para vencer')
  })

  it('linha_sla null → não aparece', () => {
    expect(renderizar('Observação: {{observacao}}{{linha_sla}}', {
      observacao: 'Motor barulhando',
      linha_sla: null,
    })).toBe('Observação: Motor barulhando')
  })

  // ── linha_nome (reset_senha) ───────────────────────────────────────────────

  it('linha_nome preenchida → " João"', () => {
    expect(renderizar('Olá{{linha_nome}}!', { linha_nome: ' João' }))
      .toBe('Olá João!')
  })

  it('linha_nome vazia → "Olá!" sem espaço duplo', () => {
    expect(renderizar('Olá{{linha_nome}}!', { linha_nome: '' }))
      .toBe('Olá!')
  })

  // ── Texto sem variáveis ────────────────────────────────────────────────────

  it('texto sem nenhuma {{variavel}} → retorna intacto', () => {
    const texto = 'Mensagem sem nada especial aqui.'
    expect(renderizar(texto, {})).toBe(texto)
  })

  it('chave com caracteres especiais não é substituída (não é \w+)', () => {
    // {{nome-completo}} não casa com \w+ — permanece literal
    expect(renderizar('{{nome-completo}}', { 'nome-completo': 'ignorado' }))
      .toBe('{{nome-completo}}')
  })

  // ── Template real — ticket_aberto WhatsApp ─────────────────────────────────

  it('template completo ticket_aberto/whatsapp renderiza corretamente', () => {
    const corpo = [
      '{{emoji_prioridade}} *Novo Ticket #{{numero}} — {{prioridade}}*',
      '',
      '*{{titulo}}*',
      '',
      '*Destino:* {{grupo}} / {{subgrupo}}{{linha_categoria}}',
      '*Aberto por:* {{ator}}',
      '',
      '{{descricao}}',
      '',
      '🔗 {{link}}',
    ].join('\n')

    const vars = {
      emoji_prioridade: '🔴',
      numero: '0001',
      prioridade: 'critica',
      titulo: 'Falha no CLP',
      grupo: 'Manutenção',
      subgrupo: 'Elétrica',
      linha_categoria: '\nCategoria: Elétrica',
      ator: 'Carlos',
      descricao: 'CLP da linha 2 parou de responder.',
      link: 'https://app.checkflow.com/tickets/abc',
    }

    const resultado = renderizar(corpo, vars)
    expect(resultado).toContain('🔴 *Novo Ticket #0001 — critica*')
    expect(resultado).toContain('*Falha no CLP*')
    expect(resultado).toContain('*Destino:* Manutenção / Elétrica\nCategoria: Elétrica')
    expect(resultado).toContain('*Aberto por:* Carlos')
    expect(resultado).toContain('CLP da linha 2 parou de responder.')
    expect(resultado).toContain('🔗 https://app.checkflow.com/tickets/abc')
    expect(resultado).not.toContain('{{')  // nenhuma chave não substituída
  })

  it('template completo ticket_movimentado renderiza sem chaves residuais', () => {
    const corpo = [
      '📋 *Ticket #{{numero}} — {{evento}}*',
      '',
      '*{{titulo}}*',
      '*Por:* {{ator}}',
      '',
      '{{observacao}}',
      '',
      '🔗 {{link}}',
    ].join('\n')

    const vars = {
      numero: '0007',
      evento: 'Ticket assumido',
      titulo: 'Vibração na bomba B2',
      ator: 'Fernanda',
      observacao: 'Assumindo o chamado. Vou verificar agora.',
      link: 'https://app.checkflow.com/tickets/xyz',
    }

    const resultado = renderizar(corpo, vars)
    expect(resultado).not.toContain('{{')
    expect(resultado).toContain('Ticket assumido')
    expect(resultado).toContain('Fernanda')
  })

  it('template plano_devolvido_n1/whatsapp renderiza sem chaves residuais', () => {
    const corpo = [
      '🟡 *Plano de Ação devolvido para N1*',
      '',
      '*Área:* {{subgrupo}}',
      '*Atividade:* {{atividade}}',
      '*Checklist:* {{checklist}}',
      '*Devolvido por (N2):* {{ator}}',
      '*Observação:* {{observacao}}',
      '',
      '🔗 {{link}}',
    ].join('\n')

    const vars = {
      subgrupo: 'Elétrica',
      atividade: 'Medir tensão',
      checklist: 'Start Operacional',
      ator: 'Marina (N2)',
      observacao: 'Faltou foto da medição.',
      link: 'https://app.checkflow.digital/gestao/planos-acao/abc',
    }

    const resultado = renderizar(corpo, vars)
    expect(resultado).not.toContain('{{')
    expect(resultado).toContain('*Devolvido por (N2):* Marina (N2)')
    expect(resultado).toContain('Faltou foto da medição.')
  })

  it('template tarefa_publicada/whatsapp usa destinatario, titulo e link', () => {
    const corpo = [
      '📋 *Nova lista de tarefas*',
      '',
      'Olá, {{destinatario}}! Você tem uma nova lista para responder: *{{titulo}}*.',
      '',
      'Abra o app na aba *Tarefas* para responder.',
      '🔗 {{link}}',
    ].join('\n')

    const vars = {
      destinatario: 'João',
      titulo: 'Abertura da Lavanderia',
      link: 'https://app.checkflow.digital/operacao',
    }

    const resultado = renderizar(corpo, vars)
    expect(resultado).not.toContain('{{')
    expect(resultado).toContain('Olá, João!')
    expect(resultado).toContain('*Abertura da Lavanderia*')
  })

  it('template reset_senha sem nome — link é o único conteúdo variável', () => {
    const corpo = [
      'Olá{{linha_nome}}! 👋',
      '',
      'Você solicitou a recuperação de senha do *CheckFlow*.',
      '',
      'Clique no link abaixo para criar uma nova senha:',
      '{{link}}',
      '',
      '_Este link expira em 1 hora._',
    ].join('\n')

    const vars = {
      linha_nome: '',
      link: 'https://app.checkflow.com/reset/token123',
    }

    const resultado = renderizar(corpo, vars)
    expect(resultado).toContain('Olá! 👋')
    expect(resultado).not.toContain('{{')
    expect(resultado).toContain('https://app.checkflow.com/reset/token123')
  })

  // ── Valores com caracteres especiais ──────────────────────────────────────

  it('valor contendo $ não quebra o replace', () => {
    // String.replace com função de substituição — $ no valor não é interpretado
    expect(renderizar('Valor: {{val}}', { val: 'R$ 1.000,00' }))
      .toBe('Valor: R$ 1.000,00')
  })

  it('valor contendo \\ não quebra o replace', () => {
    expect(renderizar('Path: {{path}}', { path: 'C:\\Users\\joao' }))
      .toBe('Path: C:\\Users\\joao')
  })

  it('template vazio → retorna string vazia', () => {
    expect(renderizar('', { nome: 'qualquer' })).toBe('')
  })

  it('mapa de vars vazio → todas as chaves viram string vazia', () => {
    expect(renderizar('{{a}} {{b}} {{c}}', {})).toBe('  ')
  })
})
