// Lógica PURA da interpretação de foto por IA (campo texto/sim_nao/numero).
// Sem I/O — usada pela rota /api/ia/interpretar-foto e coberta por testes.
// Compõe o prompt por tipo e normaliza a resposta bruta da IA no valor do campo.

// Sufixo que define o FORMATO do retorno, anexado ao prompt do gestor.
export const SUFIXO_IA_FOTO: Record<string, string> = {
  texto:   '\n\nRetorne como resposta um texto resumido, de no máximo 4 linhas.',
  sim_nao: "\n\nRetorne como resposta apenas 'sim' ou 'não', com base na análise da imagem.",
  numero:  '\n\nRetorne somente o valor absoluto, inteiro ou decimal (apenas o número, sem texto nem unidade).',
}

/** Prompt final = prompt do gestor + sufixo do tipo. Tipo inválido → só o prompt. */
export function comporPromptFoto(promptBase: string, tipo: string): string {
  return (promptBase ?? '').trim() + (SUFIXO_IA_FOTO[tipo] ?? '')
}

/** 'sim' | 'nao' | '' — casa o começo primeiro (a IA devolve a palavra), depois procura no meio. */
export function normalizarSimNao(bruto: string): string {
  const s = (bruto ?? '').toLowerCase().trim()
  if (!s) return ''
  if (/^n[ãa]o\b/.test(s)) return 'nao'
  if (/^sim\b/.test(s)) return 'sim'
  if (/\bn[ãa]o\b/.test(s)) return 'nao'
  if (/\bsim\b/.test(s)) return 'sim'
  if (s.startsWith('n')) return 'nao'
  if (s.startsWith('s')) return 'sim'
  return ''
}

/** Extrai o primeiro número (inteiro ou decimal, aceita vírgula) do texto; '' se não achar. */
export function extrairNumero(bruto: string): string {
  const m = (bruto ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? m[0] : ''
}

/** Normaliza a resposta bruta da IA no valor do campo, conforme o tipo. */
export function posProcessarFoto(bruto: string, tipo: string): string {
  const t = (bruto ?? '').trim()
  if (tipo === 'sim_nao') return normalizarSimNao(t)
  if (tipo === 'numero') return extrairNumero(t)
  // texto (e qualquer outro): no máximo 4 linhas
  return t.split('\n').slice(0, 4).join('\n').trim()
}
