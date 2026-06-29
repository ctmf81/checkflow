import { createHash, randomInt, randomBytes } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'

export type TipoToken = 'primeiro_acesso' | 'reset_admin' | 'self_service' | 'sessao_senha'

const TTL_CODIGO_MIN = 15
const TTL_SESSAO_MIN = 10
const MAX_TENTATIVAS = 5

export function hashValor(valor: string): string {
  return createHash('sha256').update(valor).digest('hex')
}

// O CPF pode estar gravado COM ou SEM máscara (dados legados inconsistentes:
// alguns "XXX.XXX.XXX-XX", outros "XXXXXXXXXXX"). Devolve as duas variantes para
// uma busca tolerante: `.in('cpf', cpfVariantes(cpf))`. Sem isso, o lookup que
// tira a máscara não encontra usuários salvos com máscara (quebra recuperação
// de senha e primeiro acesso para eles).
export function cpfVariantes(cpf: string): string[] {
  const d = (cpf ?? '').replace(/\D/g, '')
  if (d.length !== 11) return [d]
  return [d, d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')]
}

function gerarCodigo(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0')
}

function gerarTokenSessao(): string {
  return randomBytes(24).toString('hex')
}

/** Cria um código OTP de 6 dígitos para o usuário, salva o hash e retorna o código em texto puro. */
export async function criarCodigoOtp(
  sb: SupabaseClient,
  usuarioId: string,
  tipo: Exclude<TipoToken, 'sessao_senha'>,
  criadoPor?: string
): Promise<string> {
  const codigo = gerarCodigo()
  const expira = new Date(Date.now() + TTL_CODIGO_MIN * 60_000).toISOString()
  const { error } = await sb.from('password_reset_tokens').insert({
    usuario_id: usuarioId,
    tipo,
    codigo_hash: hashValor(codigo),
    criado_por: criadoPor ?? null,
    expira_em: expira,
  })
  // Não engolir a falha: se o token não persistir (ex.: tabela ausente, RLS),
  // não adianta "enviar" um código que nunca vai validar — falha alto.
  if (error) throw new Error(`Falha ao registrar o código de verificação: ${error.message}`)
  return codigo
}

/** Quantos códigos foram criados para o usuário/tipo na última hora (anti-abuso). */
export async function contarSolicitacoesRecentes(
  sb: SupabaseClient,
  usuarioId: string,
  tipo: TipoToken
): Promise<number> {
  const umaHoraAtras = new Date(Date.now() - 60 * 60_000).toISOString()
  const { count } = await sb
    .from('password_reset_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('tipo', tipo)
    .gte('criado_em', umaHoraAtras)
  return count ?? 0
}

/**
 * Valida um código OTP. Em caso de sucesso, marca o token como usado e
 * cria um token de sessão (uso único) para a etapa de definir senha.
 */
export async function validarCodigoOtp(
  sb: SupabaseClient,
  usuarioId: string,
  codigo: string
): Promise<{ ok: true; sessaoToken: string } | { ok: false; erro: string }> {
  const { data: tokens } = await sb
    .from('password_reset_tokens')
    .select('id, codigo_hash, tentativas, usado, expira_em, tipo')
    .eq('usuario_id', usuarioId)
    .in('tipo', ['primeiro_acesso', 'reset_admin', 'self_service'])
    .eq('usado', false)
    .order('criado_em', { ascending: false })
    .limit(1)

  const token = tokens?.[0]
  if (!token) return { ok: false, erro: 'Código inválido ou expirado.' }
  if (new Date(token.expira_em).getTime() < Date.now()) return { ok: false, erro: 'Código expirado. Solicite um novo.' }
  if (token.tentativas >= MAX_TENTATIVAS) return { ok: false, erro: 'Número máximo de tentativas excedido. Solicite um novo código.' }

  if (token.codigo_hash !== hashValor(codigo)) {
    await sb.from('password_reset_tokens').update({ tentativas: token.tentativas + 1 }).eq('id', token.id)
    return { ok: false, erro: 'Código incorreto.' }
  }

  await sb.from('password_reset_tokens').update({ usado: true }).eq('id', token.id)

  const sessaoToken = gerarTokenSessao()
  await sb.from('password_reset_tokens').insert({
    usuario_id: usuarioId,
    tipo: 'sessao_senha',
    codigo_hash: hashValor(sessaoToken),
    expira_em: new Date(Date.now() + TTL_SESSAO_MIN * 60_000).toISOString(),
  })

  return { ok: true, sessaoToken }
}

/** Valida o token de sessão emitido após verificar o código. Marca como usado em caso de sucesso. */
export async function validarSessaoSenha(
  sb: SupabaseClient,
  usuarioId: string,
  sessaoToken: string
): Promise<boolean> {
  const { data: tokens } = await sb
    .from('password_reset_tokens')
    .select('id, codigo_hash, usado, expira_em')
    .eq('usuario_id', usuarioId)
    .eq('tipo', 'sessao_senha')
    .eq('usado', false)
    .order('criado_em', { ascending: false })
    .limit(1)

  const token = tokens?.[0]
  if (!token) return false
  if (new Date(token.expira_em).getTime() < Date.now()) return false
  if (token.codigo_hash !== hashValor(sessaoToken)) return false

  await sb.from('password_reset_tokens').update({ usado: true }).eq('id', token.id)
  return true
}

/** Envia o código via WhatsApp + e-mail (apps/api), respeitando templates da empresa. */
export async function enviarCodigoUsuario(
  sb: SupabaseClient,
  usuario: { id: string; nome: string; telefone: string | null; email: string | null },
  codigo: string,
  contexto: 'primeiro_acesso' | 'reset_admin' | 'self_service'
): Promise<{ enviado: boolean; erro?: string }> {
  const { data: vinculo } = await sb
    .from('usuario_empresa')
    .select('empresa_id')
    .eq('usuario_id', usuario.id)
    .limit(1)
    .maybeSingle()

  const emailReal = usuario.email && !usuario.email.endsWith('@checkflow.local') ? usuario.email : undefined

  try {
    const res = await fetch(`${API_URL}/whatsapp/enviar-codigo`, {
      method: 'POST',
      // Servidor-a-servidor (pré-login, sem JWT): autentica via segredo interno.
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
      body: JSON.stringify({
        numero: usuario.telefone ?? undefined,
        nome: usuario.nome,
        codigo,
        email: emailReal,
        empresa_id: (vinculo as any)?.empresa_id ?? undefined,
        contexto,
      }),
    })
    if (!res.ok) return { enviado: false, erro: `Falha no envio (HTTP ${res.status}). Verifique a conexão do WhatsApp.` }
    const json: any = await res.json().catch(() => ({}))
    const ok = json?.whatsapp?.ok === true || json?.email?.ok === true
    return ok ? { enviado: true } : { enviado: false, erro: json?.whatsapp?.erro ?? 'WhatsApp não confirmou a entrega.' }
  } catch (e: any) {
    return { enviado: false, erro: e?.message ?? 'Falha de rede ao enviar o código.' }
  }
}
