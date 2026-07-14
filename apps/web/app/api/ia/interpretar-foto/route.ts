import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { SUFIXO_IA_FOTO, comporPromptFoto, posProcessarFoto } from '@/lib/ia/interpretarFoto'

// Interpreta uma FOTO por IA e devolve o valor de um campo de checklist
// (texto / sim_nao / numero). O prompt e o tipo vêm da atividade (server-side,
// não do cliente). Gate: característica `ia` do plano + cota de tokens. Reusa a
// infra multimodal/failover da Consulta Inteligente (não-streaming aqui).

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

interface Resultado { texto: string; usage?: { tokensIn: number; tokensOut: number } }

async function runGemini(apiKey: string, model: string, sys: string, pergunta: string, b64: string, mime: string): Promise<Resultado> {
  const gen = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model })
  const r = await gen.generateContent([{ text: sys }, { inlineData: { mimeType: mime, data: b64 } }, { text: pergunta }])
  const resp = await r.response
  const u = resp.usageMetadata
  return { texto: resp.text() ?? '', usage: u ? { tokensIn: u.promptTokenCount ?? 0, tokensOut: u.candidatesTokenCount ?? 0 } : undefined }
}

async function runAnthropic(apiKey: string, model: string, sys: string, pergunta: string, b64: string, mime: string): Promise<Resultado> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: 512, system: sys,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
        { type: 'text', text: pergunta },
      ] }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`)
  const j = await res.json()
  const texto = (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
  return { texto, usage: j.usage ? { tokensIn: j.usage.input_tokens ?? 0, tokensOut: j.usage.output_tokens ?? 0 } : undefined }
}

async function runOpenAICompat(baseUrl: string, apiKey: string, model: string, sys: string, pergunta: string, b64: string, mime: string): Promise<Resultado> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: 512,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: pergunta },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
        ] },
      ],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI-compat HTTP ${res.status}`)
  const j = await res.json()
  return { texto: j.choices?.[0]?.message?.content ?? '', usage: j.usage ? { tokensIn: j.usage.prompt_tokens ?? 0, tokensOut: j.usage.completion_tokens ?? 0 } : undefined }
}

function erro(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function POST(req: NextRequest) {
  if (!SUPABASE_SECRET) return erro('Indisponível', 500)
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return erro('Não autenticado', 401)

  const supabasePublic = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE)
  const { data: { user } } = await supabasePublic.auth.getUser(token)
  if (!user) return erro('Sessão inválida', 401)

  const body = await req.json().catch(() => ({}))
  const { atividadeId, imageBase64, mimeType, empresaId, unidadeId } = body
  if (!atividadeId || !imageBase64) return erro('Dados incompletos', 400)
  const mime = (mimeType as string) || 'image/jpeg'

  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET)

  // Prompt + tipo vêm da atividade (não do cliente)
  const { data: atv } = await sb.from('checklist_atividades').select('tipo, config').eq('id', atividadeId).single()
  if (!atv) return erro('Atividade não encontrada', 404)
  const tipo = atv.tipo as string
  const cfg = (atv.config ?? {}) as any
  if (!cfg.ia_foto || !SUFIXO_IA_FOTO[tipo]) return erro('Esta atividade não usa preenchimento por foto (IA).', 400)
  const promptBase = (cfg.ia_prompt ?? '').trim()
  if (!promptBase) return erro('Atividade sem prompt de análise configurado.', 400)

  // Gate: característica IA no plano + cota de tokens
  if (empresaId) {
    const { data: assin } = await sb.from('empresa_assinaturas').select('plano_id').eq('empresa_id', empresaId).maybeSingle()
    if (assin?.plano_id) {
      const { data: ps } = await sb.from('plano_servicos').select('servico:servico_id(flag, tipo, ativo)').eq('plano_id', assin.plano_id)
      if (ps && ps.length > 0) {
        const temIA = ps.some((row: any) => {
          const s = Array.isArray(row.servico) ? row.servico[0] : row.servico
          return s?.ativo && s?.tipo === 'caracteristica' && s?.flag === 'ia'
        })
        if (!temIA) return erro('A interpretação por foto (IA) não está incluída no seu plano.', 402)
      }
    }
    const { data: pode } = await sb.rpc('billing_pode_consumir_ia', { p_empresa_id: empresaId })
    if (pode === false) return erro('Limite de tokens de IA do plano atingido neste período.', 402)
  }

  const sys = 'Você analisa a imagem enviada e responde de forma objetiva, seguindo exatamente o formato pedido.'
  const pergunta = comporPromptFoto(promptBase, tipo)

  // Provedores (mesma config da Consulta Inteligente)
  const { data: provDb } = await sb.from('ia_provedores').select('provedor, api_key, modelo, base_url, ativo, ordem').eq('ativo', true).order('ordem', { ascending: true })
  const cfgP = new Map((provDb ?? []).map((p: any) => [p.provedor, p]))
  const key = (p: string, env?: string) => cfgP.get(p)?.api_key || env
  const mod = (p: string, env: string | undefined, def: string) => cfgP.get(p)?.modelo || env || def

  const candidatos: { nome: string; run: () => Promise<Resultado>; modelo: string }[] = []
  const push = (nome: string, k: string | undefined, modelo: string, run: () => Promise<Resultado>) => { if (k) candidatos.push({ nome, run, modelo }) }
  const gK = key('gemini', process.env.GEMINI_API_KEY), gM = mod('gemini', process.env.GEMINI_MODEL, 'gemini-2.5-flash')
  const aK = key('anthropic', process.env.ANTHROPIC_API_KEY), aM = mod('anthropic', process.env.ANTHROPIC_MODEL, 'claude-3-5-haiku-20241022')
  const oK = key('openai', process.env.OPENAI_API_KEY), oM = mod('openai', process.env.OPENAI_MODEL, 'gpt-4o-mini')
  const qK = key('groq', process.env.GROQ_API_KEY), qM = mod('groq', process.env.GROQ_MODEL, 'llama-3.2-90b-vision-preview')
  push('gemini', gK, gM, () => runGemini(gK!, gM, sys, pergunta, imageBase64, mime))
  push('anthropic', aK, aM, () => runAnthropic(aK!, aM, sys, pergunta, imageBase64, mime))
  push('openai', oK, oM, () => runOpenAICompat('https://api.openai.com/v1', oK!, oM, sys, pergunta, imageBase64, mime))
  push('groq', qK, qM, () => runOpenAICompat('https://api.groq.com/openai/v1', qK!, qM, sys, pergunta, imageBase64, mime))
  const ordem = (provDb ?? []).map((p: any) => p.provedor)
  candidatos.sort((a, b) => (ordem.indexOf(a.nome) === -1 ? 99 : ordem.indexOf(a.nome)) - (ordem.indexOf(b.nome) === -1 ? 99 : ordem.indexOf(b.nome)))
  if (candidatos.length === 0) return erro('Nenhum provedor de IA configurado. Contate o administrador.', 503)

  let bruto = ''
  let usado: { nome: string; modelo: string; usage?: Resultado['usage'] } | null = null
  for (const c of candidatos) {
    try {
      const r = await c.run()
      bruto = (r.texto ?? '').trim()
      usado = { nome: c.nome, modelo: c.modelo, usage: r.usage }
      break
    } catch (err: any) {
      sb.from('ia_falhas').insert({ contexto: 'interpretar_foto', provedor: c.nome, modelo: c.modelo, erro: String(err?.message ?? err).slice(0, 500), empresa_id: empresaId ?? null }).then(() => {}, () => {})
    }
  }
  if (!usado) return erro('Não foi possível interpretar a imagem. Tente novamente.', 502)

  // Pós-processa por tipo (lógica pura testada em lib/ia/interpretarFoto)
  const valor = posProcessarFoto(bruto, tipo)

  // Debita tokens
  if (empresaId && usado.usage) {
    await sb.from('uso_ia_eventos').insert({
      empresa_id: empresaId, unidade_id: unidadeId ?? null, usuario_id: user.id,
      provedor: usado.nome, modelo: usado.modelo,
      tokens_entrada: usado.usage.tokensIn, tokens_saida: usado.usage.tokensOut,
    })
  }

  return new Response(JSON.stringify({ valor, tipo, provedor: usado.nome }), { headers: { 'Content-Type': 'application/json' } })
}
