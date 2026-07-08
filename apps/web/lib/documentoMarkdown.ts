// Geração (1x) do markdown de um documento de Consulta Inteligente.
//
// Baixa o PDF, pede para a IA (Gemini → Anthropic, os que leem PDF) converter
// em markdown fiel e salva em documentos.conteudo_markdown. A partir daí a
// consulta usa o texto markdown (barato) em vez de reanexar o PDF a cada
// pergunta. Server-only (usa a SECRET key). Retorna o markdown ou null.

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const PROMPT_CONVERSAO = [
  'Converta o documento anexado para Markdown, o mais fiel possível ao conteúdo original.',
  'Preserve títulos (com #), listas, tabelas (em markdown) e a ordem do texto.',
  'NÃO adicione comentários, explicações, saudações ou qualquer texto que não esteja no documento.',
  'Responda APENAS com o markdown do documento.',
].join('\n')

function ehPdf(url: string): boolean {
  return url.toLowerCase().includes('.pdf')
}

interface UsoTokens { tokensIn: number; tokensOut: number }

async function converterGemini(apiKey: string, model: string, base64: string): Promise<{ md: string; uso?: UsoTokens }> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const gen = genAI.getGenerativeModel({ model })
  const result = await gen.generateContent([
    { text: PROMPT_CONVERSAO },
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
  ])
  const md = result.response.text()
  const u = result.response.usageMetadata
  return { md, uso: u ? { tokensIn: u.promptTokenCount ?? 0, tokensOut: u.candidatesTokenCount ?? 0 } : undefined }
}

async function converterAnthropic(apiKey: string, model: string, base64: string): Promise<{ md: string; uso?: UsoTokens }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: PROMPT_CONVERSAO },
      ] }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`)
  const json = await res.json()
  const md = (json.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  const u = json.usage
  return { md, uso: u ? { tokensIn: u.input_tokens ?? 0, tokensOut: u.output_tokens ?? 0 } : undefined }
}

/**
 * Gera (e salva) o markdown do documento. Idempotente: se já houver markdown,
 * retorna o existente sem reprocessar. Retorna null se não for PDF, não houver
 * provedor com suporte a PDF, ou a conversão falhar.
 */
export async function gerarMarkdownDocumento(documentoId: string): Promise<string | null> {
  if (!SUPABASE_SECRET) return null
  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SECRET)

  const { data: doc } = await sb.from('documentos')
    .select('id, arquivo_url, conteudo_markdown, unidade_id')
    .eq('id', documentoId).eq('tipo', 'consulta_inteligente').single()
  if (!doc || !doc.arquivo_url) return null
  if (doc.conteudo_markdown) return doc.conteudo_markdown          // já gerado
  if (!ehPdf(doc.arquivo_url)) return null                          // imagem: não converte

  // Baixa o PDF
  let base64: string
  try {
    const r = await fetch(doc.arquivo_url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    base64 = Buffer.from(await r.arrayBuffer()).toString('base64')
  } catch (e: any) {
    console.error('[markdown] falha ao baixar PDF:', e?.message)
    return null
  }

  // Provedores com suporte a PDF (config no banco), na ordem
  const { data: provDb } = await sb.from('ia_provedores')
    .select('provedor, api_key, modelo, ativo, ordem').eq('ativo', true).order('ordem', { ascending: true })
  const cfg = new Map((provDb ?? []).map((p: any) => [p.provedor, p]))
  const geminiKey = cfg.get('gemini')?.api_key || process.env.GEMINI_API_KEY
  const geminiModelo = cfg.get('gemini')?.modelo || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const anthropicKey = cfg.get('anthropic')?.api_key || process.env.ANTHROPIC_API_KEY
  const anthropicModelo = cfg.get('anthropic')?.modelo || process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022'

  const tentativas: { nome: string; run: () => Promise<{ md: string; uso?: UsoTokens }> }[] = []
  if (geminiKey) tentativas.push({ nome: 'gemini', run: () => converterGemini(geminiKey, geminiModelo, base64) })
  if (anthropicKey) tentativas.push({ nome: 'anthropic', run: () => converterAnthropic(anthropicKey, anthropicModelo, base64) })

  for (const t of tentativas) {
    try {
      const { md, uso } = await t.run()
      const limpo = (md ?? '').trim()
      if (!limpo) throw new Error('markdown vazio')

      await sb.from('documentos').update({
        conteudo_markdown: limpo, markdown_gerado_em: new Date().toISOString(),
      }).eq('id', documentoId)

      // Contabiliza o uso de tokens da conversão (1x) — best-effort
      if (uso && doc.unidade_id) {
        const { data: u } = await sb.from('unidades').select('empresa_id').eq('id', doc.unidade_id).single()
        if (u?.empresa_id) {
          sb.from('uso_ia_eventos').insert({
            empresa_id: u.empresa_id, unidade_id: doc.unidade_id, usuario_id: null,
            provedor: t.nome, modelo: t.nome === 'gemini' ? geminiModelo : anthropicModelo,
            tokens_entrada: uso.tokensIn, tokens_saida: uso.tokensOut,
          }).then(() => {}, () => {})
        }
      }
      return limpo
    } catch (e: any) {
      console.error(`[markdown] ${t.nome} falhou:`, e?.message)
      sb.from('ia_falhas').insert({ contexto: 'markdown', provedor: t.nome, erro: String(e?.message ?? e).slice(0, 500) })
        .then(() => {}, () => {})
    }
  }
  return null
}
