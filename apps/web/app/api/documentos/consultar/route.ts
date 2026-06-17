import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

// ─── Clientes ─────────────────────────────────────────────────────────────────

// ⚠️ Env do Railway (web) está bagunçada: NEXT_PUBLIC_SUPABASE_URL aponta para
// a API Fastify e a publishable key contém uma URL. Blindamos aqui: só aceita a
// URL se for de fato um host *.supabase.co; senão usa o projeto conhecido.
const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ─── Provedores de IA (failover) ──────────────────────────────────────────────

interface ProviderCtx {
  systemPrompt: string
  pergunta: string
  fileBase64: string
  mimeType: string
}
interface StreamController {
  emitiu: boolean
  enqueue: (texto: string) => void
  usage?: { tokensIn: number; tokensOut: number }
}

// Google Gemini — multimodal nativo (PDF + imagem)
function runGemini(apiKey: string | undefined, model: string) {
  return async function (ctx: ProviderCtx, c: StreamController) {
    const genAI = new GoogleGenerativeAI(apiKey!)
    const gen = genAI.getGenerativeModel({ model })
    const result = await gen.generateContentStream([
      { text: ctx.systemPrompt },
      { inlineData: { mimeType: ctx.mimeType, data: ctx.fileBase64 } },
      { text: ctx.pergunta },
    ])
    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) c.enqueue(text)
    }
    const usage = (await result.response).usageMetadata
    if (usage) c.usage = { tokensIn: usage.promptTokenCount ?? 0, tokensOut: usage.candidatesTokenCount ?? 0 }
  }
}

// Anthropic Claude — multimodal nativo (PDF via document block + imagem)
function runAnthropic(apiKey: string | undefined, model: string) {
  return async function (ctx: ProviderCtx, c: StreamController) {
    const ehPdf = ctx.mimeType === 'application/pdf'
    const bloco = ehPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: ctx.fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: ctx.mimeType, data: ctx.fileBase64 } }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: ctx.systemPrompt,
        stream: true,
        messages: [{ role: 'user', content: [bloco, { type: 'text', text: ctx.pergunta }] }],
      }),
    })
    if (!res.ok || !res.body) throw new Error(`Anthropic HTTP ${res.status}`)
    await lerSSE(res.body, c, (json) => {
      if (json.type === 'message_start' && json.message?.usage) {
        c.usage = { tokensIn: json.message.usage.input_tokens ?? 0, tokensOut: json.message.usage.output_tokens ?? 0 }
      }
      if (json.type === 'message_delta' && json.usage) {
        c.usage = { tokensIn: c.usage?.tokensIn ?? 0, tokensOut: json.usage.output_tokens ?? 0 }
      }
      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') return json.delta.text
      return null
    })
  }
}

// OpenAI / compatível (OpenAI, Groq, …) — imagem via image_url (sem PDF)
function runOpenAICompat(baseUrl: string, apiKey: string | undefined, model: string) {
  return async function (ctx: ProviderCtx, c: StreamController) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: ctx.systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: ctx.pergunta },
            { type: 'image_url', image_url: { url: `data:${ctx.mimeType};base64,${ctx.fileBase64}` } },
          ] },
        ],
      }),
    })
    if (!res.ok || !res.body) throw new Error(`OpenAI-compat HTTP ${res.status}`)
    await lerSSE(res.body, c, (json) => {
      if (json.usage) c.usage = { tokensIn: json.usage.prompt_tokens ?? 0, tokensOut: json.usage.completion_tokens ?? 0 }
      return json.choices?.[0]?.delta?.content ?? null
    })
  }
}

// Lê um stream SSE (data: {...}) e repassa o texto extraído por `extrair`
async function lerSSE(body: ReadableStream<Uint8Array>, c: StreamController, extrair: (json: any) => string | null) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const linhas = buffer.split('\n')
    buffer = linhas.pop() ?? ''
    for (const linha of linhas) {
      const t = linha.trim()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const texto = extrair(JSON.parse(payload))
        if (texto) c.enqueue(texto)
      } catch { /* linha parcial/keepalive — ignora */ }
    }
  }
}

// ─── POST /api/documentos/consultar ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Verifica autenticação
  const auth = req.headers.get('authorization')
  const token = auth?.replace('Bearer ', '').trim()
  if (!token) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Valida o JWT — usa a publishable/anon key, com fallback para a secret key
  // (a publishable pode não estar disponível no runtime do route handler).
  // Valida o JWT no servidor com a SECRET key (forma correta server-side);
  // a publishable/anon key vem em seguida como fallback. Ignora valores que
  // não parecem chaves (ex: env mal configurada com uma URL).
  const ehChave = (k: string) => !!k && !k.startsWith('http')
  const keyUsada = [SUPABASE_SECRET, SUPABASE_PUBLISHABLE].find(ehChave) ?? ''
  const supabasePublic = createClient(SUPABASE_URL, keyUsada)
  const { data: { user }, error: authError } = await supabasePublic.auth.getUser(token)
  if (authError || !user) {
    return Response.json({ error: 'Sessão inválida' }, { status: 401 })
  }

  // 2. Valida body
  let documento_id: string, pergunta: string
  try {
    const body = await req.json()
    documento_id = body.documento_id
    pergunta = body.pergunta?.trim()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!documento_id || !pergunta) {
    return Response.json({ error: 'documento_id e pergunta são obrigatórios' }, { status: 400 })
  }

  // 3. Busca o documento (admin para evitar RLS)
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET)
  const { data: doc, error: docError } = await supabaseAdmin
    .from('documentos')
    .select('id, nome, descricao, arquivo_url, tipo, unidade_id')
    .eq('id', documento_id)
    .eq('tipo', 'consulta_inteligente')
    .eq('status', 'ativo')
    .single()

  if (docError || !doc) {
    return Response.json({ error: 'Documento não encontrado' }, { status: 404 })
  }
  if (!doc.arquivo_url) {
    return Response.json({ error: 'Este documento não possui arquivo vinculado' }, { status: 422 })
  }

  // Empresa do documento (para registrar uso de IA por empresa)
  let empresaId: string | null = null
  if (doc.unidade_id) {
    const { data: unidadeDoc } = await supabaseAdmin.from('unidades').select('empresa_id').eq('id', doc.unidade_id).single()
    empresaId = unidadeDoc?.empresa_id ?? null
  }

  // Bloqueio por limite de tokens de IA do plano
  if (empresaId) {
    const { data: pode } = await supabaseAdmin.rpc('billing_pode_consumir_ia', { p_empresa_id: empresaId })
    if (pode === false) {
      return new Response(
        JSON.stringify({ error: 'Limite de tokens de IA do plano atingido neste período. Contate o administrador para fazer upgrade ou comprar um pacote adicional.' }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // 4. Baixa o arquivo e converte para base64
  let fileBase64: string
  let mimeType: string

  try {
    const fileRes = await fetch(doc.arquivo_url)
    if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`)

    const buffer = await fileRes.arrayBuffer()
    fileBase64 = Buffer.from(buffer).toString('base64')

    const ct = fileRes.headers.get('content-type') ?? ''
    const url = doc.arquivo_url.toLowerCase()

    if (ct.includes('pdf') || url.includes('.pdf')) {
      mimeType = 'application/pdf'
    } else if (ct.includes('png') || url.includes('.png')) {
      mimeType = 'image/png'
    } else if (ct.includes('webp') || url.includes('.webp')) {
      mimeType = 'image/webp'
    } else if (ct.includes('jpeg') || ct.includes('jpg') || url.includes('.jpg') || url.includes('.jpeg')) {
      mimeType = 'image/jpeg'
    } else {
      mimeType = 'application/pdf'
    }
  } catch (err: any) {
    console.error('[consultar] erro ao baixar arquivo:', err?.message)
    return Response.json({ error: 'Não foi possível carregar o arquivo do documento' }, { status: 500 })
  }

  // 5. Streaming com failover entre provedores de IA
  const encoder = new TextEncoder()

  const systemPrompt = [
    'Você é um assistente especializado em responder perguntas com base em documentos.',
    'Responda de forma clara, objetiva e baseada exclusivamente no conteúdo do documento fornecido.',
    'Se a informação não estiver no documento, informe isso claramente ao usuário.',
    `Documento: "${doc.nome}"`,
    doc.descricao ? `Descrição: ${doc.descricao}` : '',
  ].filter(Boolean).join('\n')

  const ctx: ProviderCtx = { systemPrompt, pergunta, fileBase64, mimeType }
  const isPdf = mimeType === 'application/pdf'

  // Config dos provedores vem do banco (gerenciada em /sistema/integracoes-ia);
  // a env var é fallback quando não há chave cadastrada para o provedor.
  const { data: provDb } = await supabaseAdmin
    .from('ia_provedores')
    .select('provedor, api_key, modelo, base_url, ativo, ordem')
    .eq('ativo', true)
    .order('ordem', { ascending: true })

  const cfgPorProvedor = new Map((provDb ?? []).map((p: any) => [p.provedor, p]))
  function chaveDe(prov: string, envKey?: string): string | undefined {
    return cfgPorProvedor.get(prov)?.api_key || envKey
  }
  function modeloDe(prov: string, envModelo: string | undefined, padrao: string): string {
    return cfgPorProvedor.get(prov)?.modelo || envModelo || padrao
  }
  function baseUrlDe(prov: string): string | undefined {
    return cfgPorProvedor.get(prov)?.base_url || undefined
  }

  const geminiKey    = chaveDe('gemini', process.env.GEMINI_API_KEY)
  const anthropicKey = chaveDe('anthropic', process.env.ANTHROPIC_API_KEY)
  const openaiKey    = chaveDe('openai', process.env.OPENAI_API_KEY)
  const groqKey      = chaveDe('groq', process.env.GROQ_API_KEY)
  const c1Key = chaveDe('custom1'); const c1Url = baseUrlDe('custom1'); const c1Modelo = cfgPorProvedor.get('custom1')?.modelo
  const c2Key = chaveDe('custom2'); const c2Url = baseUrlDe('custom2'); const c2Modelo = cfgPorProvedor.get('custom2')?.modelo

  const geminiModelo    = modeloDe('gemini', process.env.GEMINI_MODEL, 'gemini-2.5-flash')
  const anthropicModelo = modeloDe('anthropic', process.env.ANTHROPIC_MODEL, 'claude-3-5-haiku-20241022')
  const openaiModelo    = modeloDe('openai', process.env.OPENAI_MODEL, 'gpt-4o-mini')
  const groqModelo      = modeloDe('groq', process.env.GROQ_MODEL, 'llama-3.2-90b-vision-preview')

  const todos: { nome: string; key?: string; modelo: string; aceitaPdf: boolean; run: (ctx: ProviderCtx, c: StreamController) => Promise<void> }[] = [
    { nome: 'gemini',    key: geminiKey,    modelo: geminiModelo,    aceitaPdf: true,  run: runGemini(geminiKey, geminiModelo) },
    { nome: 'anthropic', key: anthropicKey, modelo: anthropicModelo, aceitaPdf: true,  run: runAnthropic(anthropicKey, anthropicModelo) },
    { nome: 'openai',    key: openaiKey,    modelo: openaiModelo,    aceitaPdf: false, run: runOpenAICompat('https://api.openai.com/v1', openaiKey, openaiModelo) },
    { nome: 'groq',      key: groqKey,      modelo: groqModelo,      aceitaPdf: false, run: runOpenAICompat('https://api.groq.com/openai/v1', groqKey, groqModelo) },
    // Provedores customizados OpenAI-compatible (SiliconFlow, DashScope, OpenRouter…)
    { nome: 'custom1', key: (c1Key && c1Url && c1Modelo) ? c1Key : undefined, modelo: c1Modelo ?? '', aceitaPdf: false, run: runOpenAICompat(c1Url ?? '', c1Key, c1Modelo ?? '') },
    { nome: 'custom2', key: (c2Key && c2Url && c2Modelo) ? c2Key : undefined, modelo: c2Modelo ?? '', aceitaPdf: false, run: runOpenAICompat(c2Url ?? '', c2Key, c2Modelo ?? '') },
  ]

  // Mantém a ordem do banco (já vem por `ordem`); provedores não-listados ficam ao fim
  const ordemBanco = (provDb ?? []).map((p: any) => p.provedor)
  const candidatos = todos
    .filter(p => p.key && (p.aceitaPdf || !isPdf))
    .sort((a, b) => {
      const ia = ordemBanco.indexOf(a.nome); const ib = ordemBanco.indexOf(b.nome)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })

  const readableStream = new ReadableStream({
    async start(controller) {
      if (candidatos.length === 0) {
        controller.enqueue(encoder.encode(isPdf
          ? '⚠️ Nenhum provedor de IA com suporte a PDF está configurado. Contate o administrador.'
          : '⚠️ Nenhum provedor de IA está configurado. Contate o administrador.'))
        controller.close()
        return
      }

      const c: StreamController = {
        emitiu: false,
        enqueue: (t: string) => { c.emitiu = true; controller.enqueue(encoder.encode(t)) },
      }

      for (let i = 0; i < candidatos.length; i++) {
        const p = candidatos[i]
        try {
          await p.run(ctx, c)
          if (empresaId && c.usage) {
            await supabaseAdmin.from('uso_ia_eventos').insert({
              empresa_id: empresaId, unidade_id: doc.unidade_id, usuario_id: user.id,
              provedor: p.nome, modelo: p.modelo,
              tokens_entrada: c.usage.tokensIn, tokens_saida: c.usage.tokensOut,
            })
          }
          controller.close()
          return
        } catch (err: any) {
          console.error(`[consultar] provedor ${p.nome} falhou:`, err?.message)
          // registra a falha para o admin (failover) — fire-and-forget
          supabaseAdmin.from('ia_falhas').insert({
            contexto: 'consulta', provedor: p.nome, modelo: p.modelo,
            erro: String(err?.message ?? err).slice(0, 500), empresa_id: empresaId,
          }).then(() => {}, () => {})
          // Se já começou a emitir texto, não dá para trocar de provedor no meio
          if (c.emitiu) {
            controller.enqueue(encoder.encode('\n\n⚠️ A resposta foi interrompida. Tente novamente.'))
            controller.close()
            return
          }
          // Senão, tenta o próximo provedor da fila
        }
      }

      // Todos falharam sem emitir nada
      controller.enqueue(encoder.encode('⚠️ Os serviços de IA estão indisponíveis ou atingiram o limite de uso no momento. Tente novamente em alguns minutos.'))
      controller.close()
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
