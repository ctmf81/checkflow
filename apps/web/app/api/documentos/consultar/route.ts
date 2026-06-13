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
}

// Google Gemini — multimodal nativo (PDF + imagem)
async function runGemini(ctx: ProviderCtx, c: StreamController) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' })
  const result = await model.generateContentStream([
    { text: ctx.systemPrompt },
    { inlineData: { mimeType: ctx.mimeType, data: ctx.fileBase64 } },
    { text: ctx.pergunta },
  ])
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) c.enqueue(text)
  }
}

// Anthropic Claude — multimodal nativo (PDF via document block + imagem)
async function runAnthropic(ctx: ProviderCtx, c: StreamController) {
  const ehPdf = ctx.mimeType === 'application/pdf'
  const bloco = ehPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: ctx.fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: ctx.mimeType, data: ctx.fileBase64 } }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: ctx.systemPrompt,
      stream: true,
      messages: [{ role: 'user', content: [bloco, { type: 'text', text: ctx.pergunta }] }],
    }),
  })
  if (!res.ok || !res.body) throw new Error(`Anthropic HTTP ${res.status}`)
  await lerSSE(res.body, c, (json) => {
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') return json.delta.text
    return null
  })
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
    await lerSSE(res.body, c, (json) => json.choices?.[0]?.delta?.content ?? null)
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
    .select('id, nome, descricao, arquivo_url, tipo')
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

  // Ordem de tentativa — só entram os que têm a env key configurada.
  // Para PDF, apenas provedores com suporte nativo a PDF (Gemini, Claude).
  const provedores: { nome: string; key?: string; aceitaPdf: boolean; run: (ctx: ProviderCtx, c: StreamController) => Promise<void> }[] = [
    { nome: 'gemini',    key: process.env.GEMINI_API_KEY,    aceitaPdf: true,  run: runGemini },
    { nome: 'anthropic', key: process.env.ANTHROPIC_API_KEY, aceitaPdf: true,  run: runAnthropic },
    { nome: 'openai',    key: process.env.OPENAI_API_KEY,    aceitaPdf: false, run: runOpenAICompat('https://api.openai.com/v1', process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4o-mini') },
    { nome: 'groq',      key: process.env.GROQ_API_KEY,      aceitaPdf: false, run: runOpenAICompat('https://api.groq.com/openai/v1', process.env.GROQ_API_KEY, process.env.GROQ_MODEL || 'llama-3.2-90b-vision-preview') },
  ]

  const candidatos = provedores.filter(p => p.key && (p.aceitaPdf || !isPdf))

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
          controller.close()
          return
        } catch (err: any) {
          console.error(`[consultar] provedor ${p.nome} falhou:`, err?.message)
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
