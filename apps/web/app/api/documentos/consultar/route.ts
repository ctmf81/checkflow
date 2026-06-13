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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

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

  // 5. Streaming com Gemini 2.0 Flash
  const encoder = new TextEncoder()

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        if (!process.env.GEMINI_API_KEY) {
          controller.enqueue(encoder.encode('[Erro: GEMINI_API_KEY não configurada. Contate o administrador.]'))
          controller.close()
          return
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

        const systemPrompt = [
          'Você é um assistente especializado em responder perguntas com base em documentos.',
          'Responda de forma clara, objetiva e baseada exclusivamente no conteúdo do documento fornecido.',
          'Se a informação não estiver no documento, informe isso claramente ao usuário.',
          `Documento: "${doc.nome}"`,
          doc.descricao ? `Descrição: ${doc.descricao}` : '',
        ].filter(Boolean).join('\n')

        const result = await model.generateContentStream([
          { text: systemPrompt },
          {
            inlineData: {
              mimeType,
              data: fileBase64,
            },
          },
          { text: pergunta },
        ])

        for await (const chunk of result.stream) {
          const text = chunk.text()
          if (text) {
            controller.enqueue(encoder.encode(text))
          }
        }

        controller.close()
      } catch (err: any) {
        console.error('[consultar] erro Gemini:', err?.message)
        const msg = `\n\n[Erro ao processar consulta: ${err?.message ?? 'falha interna'}]`
        controller.enqueue(encoder.encode(msg))
        controller.close()
      }
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
