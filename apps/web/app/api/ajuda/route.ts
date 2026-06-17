import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

// Assistente de ajuda do CheckFlow. Texto puro, com failover entre os
// provedores configurados em `ia_provedores`. Não consome o limite de tokens
// da empresa (é suporte, custo da plataforma).

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ─── Manual do CheckFlow (base de conhecimento do assistente) ───────────────
const MANUAL = `
Você é o assistente de ajuda do CheckFlow, um sistema de checklists, inspeções e gestão operacional. Responda em português, de forma curta, objetiva e prática (passo a passo quando fizer sentido). Baseie-se SOMENTE nas informações abaixo. Se não souber, diga que não tem essa informação e sugira procurar o administrador. Nunca invente telas ou funções.

VISÃO GERAL
- Dois ambientes: Operação (executar checklists no dia a dia) e Gestão (configurar e acompanhar). Admin do sistema tem o ambiente Sistema.
- Hierarquia: Empresa → Unidades → Grupos/Setores → Subgrupos. Usuários têm Perfil de acesso.

CHECKLISTS
- Em Gestão → Checklists. Crie do zero ("Novo checklist") ou a partir de um modelo pronto ("Usar um modelo" → galeria por segmento → clona para a unidade como rascunho).
- Um checklist tem seções e atividades. Tipos de atividade: sim/não, número, texto, múltipla escolha, catálogo, foto, vídeo, assinatura, data/hora, localização.
- Atividade pode ser obrigatória, crítica (se reprovada, reprova o checklist) e gerar plano de ação. Há atividades dependentes (aparecem conforme a resposta).
- Salve como rascunho e clique "Publicar" para liberar na Operação. Editar um publicado exige "Liberar edição" e republicar.

EXECUÇÃO (OPERAÇÃO)
- Em Operação o operador escolhe o checklist e executa. Pode "Continuar depois" se o checklist permitir. Há registro de "não execução" com motivo.
- Ao concluir, o resultado (aprovado/reprovado) é calculado e um PDF é gerado. Reprovações podem abrir plano de ação.

PLANOS DE AÇÃO
- Gerados por atividades não conformes. Em Gestão → Planos de Ação acompanha-se status, prazos (SLA) e tratativa (correção, moderação N1/N2).

TICKETS / CHAMADOS
- Abertura de chamados (botão "Abrir Ticket" na Operação). Quem pertence ao grupo/setor recebe; ao assumir, o ticket some para os outros. Pode comentar, resolver, devolver a quem abriu ou transferir para outro grupo/setor.

WORKFLOWS, AGENDAMENTOS, INDICADORES
- Workflows: fluxos multi-etapa encadeando checklists. Agendamentos: liberação automática e recorrente. Indicadores: gráficos de execuções, conformidade, planos e tickets.

MODELOS (TEMPLATES)
- Galeria de modelos prontos por segmento (oficina, restaurante, fábrica, etc.) para começar sem partir do zero.

PLANO & ASSINATURA
- Em Gestão → Plano (só o administrador da empresa). Mostra uso do período (execuções, tokens de IA, armazenamento), permite assinar plano pago, trocar de plano (a troca vale no fim do período vigente) e comprar pacotes adicionais.
- Limites são mensais (execuções e tokens resetam a cada período; armazenamento é total). Ao atingir um limite, a ação é bloqueada até upgrade ou compra de pacote.

PRIMEIROS PASSOS
- Empresa nova vê um card "Primeiros passos" na Home: configurar unidade, criar 1º checklist (por modelo), executar, convidar a equipe.
`.trim()

// ─── Provedores (texto puro) ────────────────────────────────────────────────
type Mensagem = { role: 'user' | 'assistant'; content: string }

async function gemini(apiKey: string, model: string, msgs: Mensagem[]): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const gen = genAI.getGenerativeModel({ model, systemInstruction: MANUAL })
  const result = await gen.generateContent({
    contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
  })
  return result.response.text()
}

async function anthropic(apiKey: string, model: string, msgs: Mensagem[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 1024, system: MANUAL, messages: msgs }),
  })
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`)
  const json = await res.json()
  return json.content?.[0]?.text ?? ''
}

async function openaiCompat(baseUrl: string, apiKey: string, model: string, msgs: Mensagem[]): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: MANUAL }, ...msgs] }),
  })
  if (!res.ok) throw new Error(`OpenAI-compat HTTP ${res.status}`)
  const json = await res.json()
  return json.choices?.[0]?.message?.content ?? ''
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })

  const ehChave = (k: string) => !!k && !k.startsWith('http')
  const keyUsada = [SUPABASE_SECRET, SUPABASE_PUBLISHABLE].find(ehChave) ?? ''
  const { data: { user } } = await createClient(SUPABASE_URL, keyUsada).auth.getUser(token)
  if (!user) return Response.json({ error: 'Sessão inválida' }, { status: 401 })

  let mensagens: Mensagem[]
  try {
    const body = await req.json()
    mensagens = (body.mensagens ?? []).slice(-8).filter((m: any) => m?.content?.trim())
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }
  if (!mensagens.length) return Response.json({ error: 'Nenhuma mensagem' }, { status: 400 })

  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET)
  const { data: provDb } = await admin.from('ia_provedores')
    .select('provedor, api_key, modelo, base_url, ativo, ordem')
    .eq('ativo', true).order('ordem', { ascending: true })

  const cfg = new Map((provDb ?? []).map((p: any) => [p.provedor, p]))
  const k = (prov: string, env?: string) => cfg.get(prov)?.api_key || env
  const m = (prov: string, env: string | undefined, padrao: string) => cfg.get(prov)?.modelo || env || padrao

  const candidatos: { nome: string; run: () => Promise<string> }[] = []
  const gk = k('gemini', process.env.GEMINI_API_KEY)
  if (gk) candidatos.push({ nome: 'gemini', run: () => gemini(gk, m('gemini', process.env.GEMINI_MODEL, 'gemini-2.0-flash'), mensagens) })
  const ak = k('anthropic', process.env.ANTHROPIC_API_KEY)
  if (ak) candidatos.push({ nome: 'anthropic', run: () => anthropic(ak, m('anthropic', process.env.ANTHROPIC_MODEL, 'claude-3-5-haiku-20241022'), mensagens) })
  const ok = k('openai', process.env.OPENAI_API_KEY)
  if (ok) candidatos.push({ nome: 'openai', run: () => openaiCompat('https://api.openai.com/v1', ok, m('openai', process.env.OPENAI_MODEL, 'gpt-4o-mini'), mensagens) })
  const grk = k('groq', process.env.GROQ_API_KEY)
  if (grk) candidatos.push({ nome: 'groq', run: () => openaiCompat('https://api.groq.com/openai/v1', grk, m('groq', process.env.GROQ_MODEL, 'llama-3.1-8b-instant'), mensagens) })
  for (const cn of ['custom1', 'custom2']) {
    const ck = cfg.get(cn)?.api_key, cu = cfg.get(cn)?.base_url, cm = cfg.get(cn)?.modelo
    if (ck && cu && cm) candidatos.push({ nome: cn, run: () => openaiCompat(cu, ck, cm, mensagens) })
  }

  // ordem do banco
  const ordem = (provDb ?? []).map((p: any) => p.provedor)
  candidatos.sort((a, b) => (ordem.indexOf(a.nome) === -1 ? 99 : ordem.indexOf(a.nome)) - (ordem.indexOf(b.nome) === -1 ? 99 : ordem.indexOf(b.nome)))

  if (!candidatos.length) {
    return Response.json({ resposta: 'O assistente de IA ainda não está configurado. Contate o administrador do sistema.' })
  }

  for (const c of candidatos) {
    try {
      const resposta = await c.run()
      if (resposta?.trim()) return Response.json({ resposta: resposta.trim() })
    } catch (e: any) {
      console.error(`[ajuda] provedor ${c.nome} falhou:`, e?.message)
    }
  }
  return Response.json({ error: 'Não foi possível obter resposta no momento. Tente novamente.' }, { status: 502 })
}
