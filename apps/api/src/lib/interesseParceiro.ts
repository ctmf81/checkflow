/**
 * Interesse de parceiro — formulário público da apresentação (/apresentacao_parceiro).
 *
 * Lógica pura (validação + montagem do e-mail) separada da rota para ser testável.
 * A rota `POST /parceiros/interesse` valida o corpo, monta o e-mail e dispara para
 * o endereço de contato. Público (sem auth) → validação + honeypot contra spam.
 */

export interface InteresseParceiroInput {
  nome?: string
  cidade?: string
  area?: string
  observacao?: string
  telefone?: string
  email?: string
  /** honeypot: campo escondido; se vier preenchido, é bot */
  website?: string
}

export interface InteresseParceiroLimpo {
  nome: string
  cidade: string
  area: string
  observacao: string
  telefone: string
  email: string
}

export type ResultadoValidacao =
  | { ok: true; dados: InteresseParceiroLimpo }
  | { ok: false; erro: string; spam?: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cap(s: string | undefined, n: number): string {
  return (s ?? '').trim().slice(0, n)
}

export function validarInteresseParceiro(body: InteresseParceiroInput | undefined | null): ResultadoValidacao {
  const b = body ?? {}

  // Honeypot preenchido = bot. Não é erro para o usuário real (o campo é
  // invisível): a rota responde "ok" e simplesmente descarta.
  if ((b.website ?? '').trim() !== '') {
    return { ok: false, erro: 'spam', spam: true }
  }

  const nome = (b.nome ?? '').trim()
  const email = (b.email ?? '').trim()
  const telefone = (b.telefone ?? '').trim()

  if (nome.length < 2) return { ok: false, erro: 'Informe seu nome.' }
  if (!EMAIL_RE.test(email)) return { ok: false, erro: 'Informe um e-mail válido.' }
  if (telefone.replace(/\D/g, '').length < 8) return { ok: false, erro: 'Informe um telefone válido.' }

  return {
    ok: true,
    dados: {
      nome: cap(nome, 120),
      cidade: cap(b.cidade, 120),
      area: cap(b.area, 160),
      observacao: cap(b.observacao, 2000),
      telefone: cap(telefone, 40),
      email: cap(email, 200),
    },
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function montarEmailInteresse(d: InteresseParceiroLimpo): { assunto: string; html: string } {
  const linha = (rotulo: string, valor: string) =>
    valor
      ? `<tr>
           <td style="padding:8px 14px;color:#64748b;font:600 12px/1.4 -apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;vertical-align:top">${rotulo}</td>
           <td style="padding:8px 14px;color:#0f172a;font:14px/1.5 -apple-system,Segoe UI,sans-serif">${escapeHtml(valor)}</td>
         </tr>`
      : ''

  const assunto = `Novo interesse de parceiro — ${d.nome}`
  const html = `
  <div style="background:#f1f5f9;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
      <div style="background:#12a150;padding:18px 24px;color:#fff;font:700 16px -apple-system,Segoe UI,sans-serif">
        CheckFlow · Novo interesse de parceiro
      </div>
      <table style="width:100%;border-collapse:collapse">
        ${linha('Nome', d.nome)}
        ${linha('E-mail', d.email)}
        ${linha('Telefone', d.telefone)}
        ${linha('Cidade', d.cidade)}
        ${linha('Área de atuação', d.area)}
        ${linha('Observação', d.observacao)}
      </table>
      <div style="padding:14px 24px;color:#94a3b8;font:12px -apple-system,Segoe UI,sans-serif;border-top:1px solid #e2e8f0">
        Enviado pelo formulário da página /apresentacao_parceiro.
      </div>
    </div>
  </div>`

  return { assunto, html }
}
