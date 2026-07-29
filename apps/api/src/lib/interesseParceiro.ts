/**
 * Interesse de parceiro — formulário público da apresentação (/apresentacao_parceiro).
 *
 * Lógica pura (validação + montagem do registro) separada da rota para ser testável.
 * A rota `POST /parceiros/interesse` valida o corpo e GRAVA um pré-cadastro PENDENTE
 * em `parceiro_pre_cadastros` (mesmo inbox do /seja-parceiro; o admin valida e
 * aprova em /sistema/parceiros). Público (sem auth) → validação + honeypot anti-spam.
 *
 * Não há colunas para "área de atuação" e "cidade/UF" na tabela — elas entram no
 * campo livre `mensagem` (que o painel já exibe), evitando migration.
 */

export interface InteresseParceiroInput {
  nome?: string
  documento?: string      // CPF ou CNPJ
  email?: string
  telefone?: string
  cep?: string
  cidade?: string         // derivada do CEP (ViaCEP) no cliente
  estado?: string         // UF derivada do CEP
  area?: string           // área de atuação
  observacao?: string
  /** honeypot: campo escondido; se vier preenchido, é bot */
  website?: string
}

/** Linha pronta para inserir em `parceiro_pre_cadastros` (status pendente). */
export interface PreCadastroParceiro {
  nome: string
  documento: string
  email: string
  telefone: string | null
  cep: string | null
  mensagem: string
}

export type ResultadoValidacao =
  | { ok: true; dados: PreCadastroParceiro }
  | { ok: false; erro: string; spam?: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cap(s: string | undefined, n: number): string {
  return (s ?? '').trim().slice(0, n)
}

function digitos(s: string | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

function todosIguais(d: string): boolean {
  return /^(\d)\1+$/.test(d)
}

/** Validação real (dígito verificador) de CPF. */
export function cpfValido(valor: string): boolean {
  const d = digitos(valor)
  if (d.length !== 11 || todosIguais(d)) return false
  const dv = (fim: number) => {
    let soma = 0
    for (let i = 0; i < fim; i++) soma += Number(d[i]) * (fim + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/** Validação real (dígito verificador) de CNPJ. */
export function cnpjValido(valor: string): boolean {
  const d = digitos(valor)
  if (d.length !== 14 || todosIguais(d)) return false
  const dv = (len: number) => {
    const pesos = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < len; i++) soma += Number(d[i]) * pesos[i]
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

/** Aceita CPF (11) ou CNPJ (14) com dígito verificador correto. */
export function documentoValido(valor: string): boolean {
  const d = digitos(valor)
  if (d.length === 11) return cpfValido(d)
  if (d.length === 14) return cnpjValido(d)
  return false
}

/** Monta o texto que vai em `mensagem` (área, cidade/UF e observação livre). */
export function montarMensagem(i: InteresseParceiroInput): string {
  const area = cap(i.area, 160)
  const cidade = cap(i.cidade, 120)
  const estado = cap(i.estado, 40)
  const obs = cap(i.observacao, 2000)

  const partes = ['[Interesse via apresentação]']
  if (area) partes.push(`Área de atuação: ${area}`)
  if (cidade || estado) partes.push(`Cidade/UF: ${[cidade, estado].filter(Boolean).join('/')}`)
  if (obs) partes.push(`Observação: ${obs}`)
  return partes.join('\n')
}

export function validarInteresseParceiro(body: InteresseParceiroInput | undefined | null): ResultadoValidacao {
  const b = body ?? {}

  // Honeypot preenchido = bot. Não é erro para o usuário real (o campo é
  // invisível): a rota responde "ok" e simplesmente descarta.
  if ((b.website ?? '').trim() !== '') {
    return { ok: false, erro: 'spam', spam: true }
  }

  const nome = cap(b.nome, 120)
  const email = (b.email ?? '').trim()
  const doc = digitos(b.documento)
  const tel = digitos(b.telefone)

  if (nome.length < 2) return { ok: false, erro: 'Informe seu nome.' }
  if (!EMAIL_RE.test(email)) return { ok: false, erro: 'Informe um e-mail válido.' }
  if (!documentoValido(doc)) return { ok: false, erro: 'Informe um CPF ou CNPJ válido.' }
  if (tel.length < 8) return { ok: false, erro: 'Informe um telefone válido.' }

  return {
    ok: true,
    dados: {
      nome,
      documento: doc,
      email: cap(email, 200),
      telefone: cap(b.telefone, 40) || null,
      cep: digitos(b.cep) || null,
      mensagem: montarMensagem(b),
    },
  }
}
