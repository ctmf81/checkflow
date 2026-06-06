/**
 * Cliente de email via Resend
 * Docs: https://resend.com/docs
 *
 * Variáveis de ambiente necessárias:
 *   RESEND_API_KEY  — chave da API do Resend (re_xxxxxxxxxxxx)
 *   EMAIL_FROM      — remetente verificado, ex: "CheckFlow <noreply@seudominio.com.br>"
 *
 * Sem RESEND_API_KEY: função retorna { ok: false } silenciosamente.
 */

import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM = process.env.EMAIL_FROM ?? 'CheckFlow <noreply@checkflow.app>'

export interface EmailPayload {
  para: string
  assunto: string
  html: string
}

export async function enviarEmail({ para, assunto, html }: EmailPayload): Promise<{ ok: boolean; erro?: string }> {
  if (!resend) return { ok: false, erro: 'RESEND_API_KEY não configurada' }
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: para,
      subject: assunto,
      html,
    })
    if (error) return { ok: false, erro: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: e.message }
  }
}
