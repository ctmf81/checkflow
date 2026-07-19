/**
 * Templates HTML de email para notificações de Plano de Ação e Tickets
 */

const APP_URL = process.env.APP_URL ?? 'https://app.checkflow.digital'

function base(conteudo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
        <!-- Header -->
        <tr>
          <td style="background:#ffffff;padding:20px 28px;border-bottom:1px solid #f3f4f6">
            <img src="${APP_URL}/logo-checkflow.png" alt="CheckFlow" height="28" style="display:block;height:28px" />
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:28px">${conteudo}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#fafafa">
            <p style="margin:0;font-size:11px;color:#9ca3af">
              Este email foi enviado automaticamente pelo CheckFlow. Não responda a este email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function btnLink(href: string, texto: string, cor = '#f97316'): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:${cor};color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px">${texto}</a>`
}

function row(label: string, valor: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#6b7280;width:110px;vertical-align:top">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:500">${valor}</td>
  </tr>`
}

// ─── Template: Fim de trial se aproximando ───────────────────────────────────

export function emailTrialExpirando(dados: {
  nomeDestinatario: string
  nomeEmpresa: string
  diasRestantes: number
  link: string
}): { assunto: string; html: string } {
  const { nomeDestinatario, nomeEmpresa, diasRestantes, link } = dados
  const quando = diasRestantes <= 0
    ? 'termina hoje'
    : diasRestantes === 1
      ? 'termina amanhã'
      : `termina em ${diasRestantes} dias`
  const assunto = `Seu teste do CheckFlow ${quando} — contrate para não perder recursos`
  const conteudo = `
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Olá, ${nomeDestinatario}</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#111827;font-weight:700">Seu período de teste ${quando}</h1>
    <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6">
      O teste da empresa <strong>${nomeEmpresa}</strong> está chegando ao fim. Quando ele terminar,
      a conta continua funcionando em <strong>modo somente-leitura</strong>: você segue consultando e
      operando o que já existe, mas <strong>não será possível criar novos itens</strong>
      (checklists, listas de tarefas, tickets, agendamentos, workflows ou relatórios) até contratar um plano.
    </p>
    <p style="margin:0 0 4px;font-size:14px;color:#374151;line-height:1.6">
      Para manter tudo funcionando, contrate um plano agora:
    </p>
    ${btnLink(link, 'Ver planos e contratar')}
  `
  return { assunto, html: base(conteudo) }
}

// ─── Template: Plano aberto → N1/N2 ──────────────────────────────────────────

export function emailPlanoAberto(dados: {
  nomeDestinatario: string
  nomeAtividade: string
  nomeChecklist: string
  nomeSubgrupo: string
  observacao: string
  atorNome: string
  sla: string | null
  planoId: string
  fotoUrl?: string | null
}): { assunto: string; html: string } {
  const link = `${APP_URL}/gestao/planos-acao/${dados.planoId}`
  const slaLinha = dados.sla ? row('SLA', `<span style="color:#d97706;font-weight:600">${dados.sla}</span>`) : ''
  const fotoBloco = dados.fotoUrl
    ? `<div style="margin-top:16px;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
        <img src="${dados.fotoUrl}" alt="Evidência" style="width:100%;max-height:300px;object-fit:cover;display:block" />
        <p style="margin:0;padding:6px 12px;font-size:11px;color:#9ca3af;background:#f9fafb;border-top:1px solid #e5e7eb">📷 Evidência da abertura</p>
       </div>`
    : ''

  const html = base(`
    <div style="display:inline-block;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:6px 12px;margin-bottom:20px">
      <span style="color:#dc2626;font-size:13px;font-weight:700">🔴 Novo Plano de Ação</span>
    </div>

    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827">Olá, ${dados.nomeDestinatario}!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">Um novo plano de ação foi aberto na sua área e precisa de moderação.</p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f3f4f6;margin-bottom:8px">
      ${row('Área', dados.nomeSubgrupo)}
      ${row('Atividade', dados.nomeAtividade)}
      ${row('Checklist', dados.nomeChecklist)}
      ${row('Aberto por', dados.atorNome)}
      ${slaLinha}
    </table>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-top:16px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Observação</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">${dados.observacao}</p>
    </div>

    ${fotoBloco}

    ${btnLink(link, 'Ver Plano de Ação →', '#dc2626')}
  `)

  return {
    assunto: `🔴 Plano de Ação aberto — ${dados.nomeAtividade}`,
    html,
  }
}

// ─── Template: Plano escalado → N2 ───────────────────────────────────────────

export function emailPlanoEnviadoN2(dados: {
  nomeDestinatario: string
  nomeAtividade: string
  nomeChecklist: string
  nomeSubgrupo: string
  observacao: string
  n1Nome: string
  planoId: string
  fotoUrl?: string | null
}): { assunto: string; html: string } {
  const link = `${APP_URL}/gestao/planos-acao/${dados.planoId}`
  const fotoBloco = dados.fotoUrl
    ? `<div style="margin-top:16px;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
        <img src="${dados.fotoUrl}" alt="Evidência" style="width:100%;max-height:300px;object-fit:cover;display:block" />
        <p style="margin:0;padding:6px 12px;font-size:11px;color:#9ca3af;background:#f9fafb;border-top:1px solid #e5e7eb">📷 Evidência da abertura do plano</p>
       </div>`
    : ''

  const html = base(`
    <div style="display:inline-block;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:6px 12px;margin-bottom:20px">
      <span style="color:#ea580c;font-size:13px;font-weight:700">🟠 Plano Escalado para Você (N2)</span>
    </div>

    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827">Olá, ${dados.nomeDestinatario}!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">O moderador N1 escalou um plano de ação para sua análise.</p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f3f4f6;margin-bottom:8px">
      ${row('Área', dados.nomeSubgrupo)}
      ${row('Atividade', dados.nomeAtividade)}
      ${row('Checklist', dados.nomeChecklist)}
      ${row('Enviado por (N1)', dados.n1Nome)}
    </table>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-top:16px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Observação do N1</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">${dados.observacao}</p>
    </div>

    ${fotoBloco}

    ${btnLink(link, 'Moderar Plano de Ação →', '#ea580c')}
  `)

  return {
    assunto: `🟠 Plano de Ação escalado para você — ${dados.nomeAtividade}`,
    html,
  }
}

// ─── Template: Ticket aberto → membros do grupo/subgrupo ─────────────────────

export function emailTicketAberto(dados: {
  nomeDestinatario: string
  numero: string
  titulo: string
  descricao: string
  prioridade: string
  nomeGrupo: string
  nomeSubgrupo: string
  categoria: string | null
  atorNome: string
  fotoUrl?: string | null
  ticketId: string
}): { assunto: string; html: string } {
  const link = `${APP_URL}/gestao/tickets/${dados.ticketId}`
  const PRIORIDADE_COR: Record<string, string> = {
    critica: '#dc2626', alta: '#ea580c', media: '#ca8a04', baixa: '#16a34a',
  }
  const PRIORIDADE_EMOJI: Record<string, string> = {
    critica: '🔴', alta: '🟠', media: '🟡', baixa: '🟢',
  }
  const cor   = PRIORIDADE_COR[dados.prioridade] ?? '#6b7280'
  const emoji = PRIORIDADE_EMOJI[dados.prioridade] ?? '⚪'
  const cat   = dados.categoria ? row('Categoria', dados.categoria) : ''
  const fotoBloco = dados.fotoUrl
    ? `<div style="margin-top:16px;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
        <img src="${dados.fotoUrl}" alt="Evidência" style="width:100%;max-height:300px;object-fit:cover;display:block" />
        <p style="margin:0;padding:6px 12px;font-size:11px;color:#9ca3af;background:#f9fafb;border-top:1px solid #e5e7eb">📷 Evidência</p>
       </div>`
    : ''

  const html = base(`
    <div style="display:inline-block;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:6px 12px;margin-bottom:20px">
      <span style="color:${cor};font-size:13px;font-weight:700">${emoji} Novo Ticket — Prioridade ${dados.prioridade.charAt(0).toUpperCase() + dados.prioridade.slice(1)}</span>
    </div>

    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827">Olá, ${dados.nomeDestinatario}!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">Um novo ticket foi aberto para a sua área e aguarda ser assumido.</p>

    <div style="background:#f9fafb;border-left:4px solid ${cor};border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px">
      <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">#${dados.numero}</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#111827">${dados.titulo}</p>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f3f4f6;margin-bottom:8px">
      ${row('Destino', `${dados.nomeGrupo} / ${dados.nomeSubgrupo}`)}
      ${cat}
      ${row('Aberto por', dados.atorNome)}
    </table>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-top:16px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Descrição</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">${dados.descricao}</p>
    </div>

    ${fotoBloco}
    ${btnLink(link, 'Ver Ticket →', cor)}
  `)

  return {
    assunto: `${emoji} Ticket #${dados.numero} aberto — ${dados.titulo}`,
    html,
  }
}

// ─── Template: Ticket movimentado → partes envolvidas ────────────────────────

export function emailTicketMovimentado(dados: {
  nomeDestinatario: string
  numero: string
  titulo: string
  eventoLabel: string
  atorNome: string
  texto: string
  fotoUrl?: string | null
  ticketId: string
}): { assunto: string; html: string } {
  const link = `${APP_URL}/gestao/tickets/${dados.ticketId}`
  const fotoBloco = dados.fotoUrl
    ? `<div style="margin-top:16px;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
        <img src="${dados.fotoUrl}" alt="Evidência" style="width:100%;max-height:300px;object-fit:cover;display:block" />
       </div>`
    : ''

  const html = base(`
    <div style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:6px 12px;margin-bottom:20px">
      <span style="color:#2563eb;font-size:13px;font-weight:700">📋 ${dados.eventoLabel}</span>
    </div>

    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827">Olá, ${dados.nomeDestinatario}!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">Houve uma movimentação no ticket que envolve você.</p>

    <div style="background:#f9fafb;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px">
      <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">#${dados.numero}</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#111827">${dados.titulo}</p>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f3f4f6;margin-bottom:8px">
      ${row('Ação', dados.eventoLabel)}
      ${row('Por', dados.atorNome)}
    </table>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-top:16px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Observação</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">${dados.texto}</p>
    </div>

    ${fotoBloco}
    ${btnLink(link, 'Ver Ticket →', '#2563eb')}
  `)

  return {
    assunto: `📋 Ticket #${dados.numero} — ${dados.eventoLabel}`,
    html,
  }
}

// ─── Template: Parceiro — boas-vindas ────────────────────────────────────────

export function emailParceiroBoasVindas(dados: {
  nomeParceiro: string
  nomeEmpresa: string
  percentual: number | null
}): { assunto: string; html: string } {
  const percentualLinha = dados.percentual != null
    ? row('Seu percentual', `<span style="color:#16a34a;font-weight:700">${formatarPercentual(dados.percentual)}</span>`)
    : ''

  const html = base(`
    <div style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 12px;margin-bottom:20px">
      <span style="color:#16a34a;font-size:13px;font-weight:700">🤝 Programa de Parceiros CheckFlow</span>
    </div>

    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827">Bem-vindo(a), ${dados.nomeParceiro}!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">
      Você foi cadastrado(a) como parceiro indicador do CheckFlow pela empresa
      <strong>${dados.nomeEmpresa}</strong>. Enquanto o contrato dessa empresa
      estiver ativo, você recebe um percentual da mensalidade como recompensa
      pela indicação.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f3f4f6;margin-bottom:8px">
      ${row('Empresa indicada', dados.nomeEmpresa)}
      ${percentualLinha}
    </table>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-top:16px">
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6">
        Todo último dia do mês você recebe por aqui um resumo com as empresas
        vinculadas a você, o plano contratado por cada uma e a estimativa de
        comissão do período.
      </p>
    </div>
  `)

  return {
    assunto: '🤝 Bem-vindo(a) ao Programa de Parceiros CheckFlow',
    html,
  }
}

// ─── Template: Parceiro — resumo mensal ──────────────────────────────────────

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

export function emailParceiroResumoMensal(dados: {
  nomeParceiro: string
  mesReferenciaLabel: string // ex: "junho/2026"
  empresas: {
    nome: string
    plano: string | null
    valorMensalidade: number | null
    percentual: number | null
    comissaoEstimada: number | null
  }[]
  totalEstimado: number
  empresasInativadas: string[]
}): { assunto: string; html: string } {
  const linhasEmpresas = dados.empresas.map(e => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;font-weight:600">${e.nome}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">${e.plano ?? '—'}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:right">${e.valorMensalidade != null ? formatarMoeda(e.valorMensalidade) : '—'}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:right">${e.percentual != null ? formatarPercentual(e.percentual) : '—'}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#16a34a;font-weight:700;text-align:right">${e.comissaoEstimada != null ? formatarMoeda(e.comissaoEstimada) : '—'}</td>
    </tr>
  `).join('')

  const avisoInativas = dados.empresasInativadas.length > 0
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin-top:20px">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.05em">⚠️ Atenção</p>
        <p style="margin:0;font-size:13px;color:#374151;line-height:1.6">
          ${dados.empresasInativadas.length === 1 ? 'A empresa abaixo ficou inativa' : 'As empresas abaixo ficaram inativas'}
          neste período e deixam de gerar comissão a partir de agora:
          <strong>${dados.empresasInativadas.join(', ')}</strong>.
        </p>
       </div>`
    : ''

  const html = base(`
    <div style="display:inline-block;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:6px 12px;margin-bottom:20px">
      <span style="color:#ea580c;font-size:13px;font-weight:700">📊 Resumo Mensal — Parceiros CheckFlow</span>
    </div>

    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827">Olá, ${dados.nomeParceiro}!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">
      Aqui está o resumo de ${dados.mesReferenciaLabel} das empresas que você indicou ao CheckFlow.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%">
      <thead>
        <tr>
          <th style="padding:0 0 8px;border-bottom:2px solid #e5e7eb;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;text-align:left">Empresa</th>
          <th style="padding:0 0 8px;border-bottom:2px solid #e5e7eb;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;text-align:left">Plano</th>
          <th style="padding:0 0 8px;border-bottom:2px solid #e5e7eb;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;text-align:right">Mensalidade</th>
          <th style="padding:0 0 8px;border-bottom:2px solid #e5e7eb;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;text-align:right">%</th>
          <th style="padding:0 0 8px;border-bottom:2px solid #e5e7eb;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;text-align:right">Comissão</th>
        </tr>
      </thead>
      <tbody>
        ${linhasEmpresas}
      </tbody>
    </table>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin-top:16px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;font-weight:600;color:#15803d">Total estimado do mês</span>
      <span style="font-size:20px;font-weight:800;color:#15803d">${formatarMoeda(dados.totalEstimado)}</span>
    </div>

    ${avisoInativas}

    <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;line-height:1.6">
      Os valores acima são uma estimativa com base no plano contratado e no seu
      percentual de indicação. A confirmação dos valores efetivamente pagos
      será feita na etapa financeira do programa de parceiros.
    </p>
  `)

  return {
    assunto: `📊 CheckFlow — Resumo de parceria (${dados.mesReferenciaLabel})`,
    html,
  }
}

// ─── Template: Fatura vencida (pagamento em atraso) → admin da empresa ────────

export function emailFaturaVencida(dados: {
  nomeDestinatario: string
  nomeEmpresa: string
  valor: number | null
  vencimento: string | null
  invoiceUrl: string | null
  link: string
}): { assunto: string; html: string } {
  const { nomeDestinatario, nomeEmpresa, valor, vencimento, invoiceUrl, link } = dados
  const valorFmt = valor != null
    ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null
  const assunto = `Fatura em atraso — ${nomeEmpresa}`
  const conteudo = `
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Olá, ${nomeDestinatario}</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#111827;font-weight:700">Sua fatura está em atraso</h1>
    <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6">
      A fatura da empresa <strong>${nomeEmpresa}</strong> consta como <strong>não paga</strong>.
      Regularize para manter a assinatura ativa e evitar bloqueio de criação de novos itens.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 4px">
      ${valorFmt ? row('Valor', valorFmt) : ''}
      ${vencimento ? row('Vencimento', vencimento) : ''}
    </table>
    ${btnLink(invoiceUrl || link, invoiceUrl ? 'Pagar fatura' : 'Ver plano e cobranças', '#dc2626')}
  `
  return { assunto, html: base(conteudo) }
}

// ─── Template: Pré-cadastros pendentes → admin da empresa ─────────────────────

export function emailPreCadastrosPendentes(dados: {
  nomeDestinatario: string
  nomeEmpresa: string
  quantidade: number
  link: string
}): { assunto: string; html: string } {
  const { nomeDestinatario, nomeEmpresa, quantidade, link } = dados
  const item = quantidade === 1 ? 'um pré-cadastro' : `${quantidade} pré-cadastros`
  const assunto = `${quantidade} pré-cadastro(s) aguardando aprovação — ${nomeEmpresa}`
  const conteudo = `
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Olá, ${nomeDestinatario}</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#111827;font-weight:700">Pré-cadastros aguardando você</h1>
    <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6">
      A empresa <strong>${nomeEmpresa}</strong> tem <strong>${item}</strong> aguardando aprovação.
      Enquanto não forem aprovadas, essas pessoas não conseguem acessar o sistema.
    </p>
    <p style="margin:0 0 4px;font-size:14px;color:#374151;line-height:1.6">
      Revise em <strong>Acessos → Usuários</strong>:
    </p>
    ${btnLink(link, 'Revisar pré-cadastros')}
  `
  return { assunto, html: base(conteudo) }
}
