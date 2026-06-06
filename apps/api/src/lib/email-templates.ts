/**
 * Templates HTML de email para notificações de Plano de Ação
 */

const APP_URL = process.env.APP_URL ?? 'https://checkflow-production-b19d.up.railway.app'

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
          <td style="background:#f97316;padding:20px 28px">
            <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">CheckFlow</p>
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
