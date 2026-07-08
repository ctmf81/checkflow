import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gerarMarkdownDocumento } from '@/lib/documentoMarkdown'

// POST /api/documentos/extrair-markdown  { documento_id }
// Gera (1x) o markdown do PDF de um documento de Consulta Inteligente.
// Chamado ao publicar/salvar o documento — deixa a 1ª consulta já rápida.
// Idempotente: se já houver markdown, não reprocessa.

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })

  const ehChave = (k: string) => !!k && !k.startsWith('http')
  const keyUsada = [SUPABASE_SECRET, SUPABASE_PUBLISHABLE].find(ehChave) ?? ''
  const { data: { user }, error } = await createClient(SUPABASE_URL, keyUsada).auth.getUser(token)
  if (error || !user) return Response.json({ error: 'Sessão inválida' }, { status: 401 })

  let documento_id: string
  try { documento_id = (await req.json()).documento_id } catch { return Response.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!documento_id) return Response.json({ error: 'documento_id é obrigatório' }, { status: 400 })

  const md = await gerarMarkdownDocumento(documento_id)
  return Response.json({ ok: !!md, chars: md?.length ?? 0 })
}
