import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

// Gera um TEMPLATE de checklist com IA (admin). A IA devolve JSON estruturado;
// criamos o template como RASCUNHO para o admin revisar/publicar no montador.
// Reusa os provedores de ia_provedores (failover). Não consome tokens de empresa.

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const TIPOS_OK = ['sim_nao', 'numero', 'texto', 'foto', 'data_hora', 'multipla_escolha']

const SYSTEM = `Você cria modelos de checklist operacional para o CheckFlow. Responda ESTRITAMENTE com um JSON válido (sem markdown, sem comentários, sem texto fora do JSON) no formato:
{
  "nome": "string curta",
  "descricao": "string curta",
  "secoes": [
    {
      "nome": "string",
      "atividades": [
        {
          "nome": "string (a verificação a ser feita)",
          "tipo": "sim_nao | numero | texto | foto | data_hora | multipla_escolha",
          "obrigatoria": true,
          "critica": false,
          "gera_plano_acao": false,
          "config": {},
          "opcoes": []
        }
      ]
    }
  ]
}
Regras:
- Use SOMENTE estes tipos: sim_nao, numero, texto, foto, data_hora, multipla_escolha.
- Para tipo "sim_nao": config = {"esperado":"sim"} (ou "nao"), o valor que representa conformidade.
- Para tipo "numero": config = {"min":N,"max":N,"unidade":"texto curto"} quando fizer sentido (ex: temperatura).
- Para tipo "multipla_escolha": preencha "opcoes" = [{"label":"texto","valor":"texto","e_valido":true}] (e_valido=false reprova se escolhida).
- Demais tipos: config = {}, opcoes = [].
- Marque "critica": true e "gera_plano_acao": true em itens de risco/segurança que, se reprovados, devem reprovar o checklist e abrir plano de ação.
- Gere de 2 a 6 seções, cada uma com 2 a 8 atividades, claras e específicas do contexto pedido. Português do Brasil.`

type Mensagem = { system: string; user: string }

async function gemini(apiKey: string, model: string, p: Mensagem): Promise<string> {
  const gen = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model, systemInstruction: p.system, generationConfig: { responseMimeType: 'application/json' } as any })
  return (await gen.generateContent(p.user)).response.text()
}
async function anthropic(apiKey: string, model: string, p: Mensagem): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 4000, system: p.system, messages: [{ role: 'user', content: p.user }] }),
  })
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`)
  return (await res.json()).content?.[0]?.text ?? ''
}
async function openaiCompat(baseUrl: string, apiKey: string, model: string, p: Mensagem): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }] }),
  })
  if (!res.ok) throw new Error(`OpenAI-compat HTTP ${res.status}`)
  return (await res.json()).choices?.[0]?.message?.content ?? ''
}

function parseJson(texto: string): any {
  let t = texto.trim()
  // remove cercas ```json ... ```
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  // recorta do primeiro { ao último }
  const i = t.indexOf('{'), j = t.lastIndexOf('}')
  if (i >= 0 && j > i) t = t.slice(i, j + 1)
  return JSON.parse(t)
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })
  const ehChave = (k: string) => !!k && !k.startsWith('http')
  const keyUsada = [SUPABASE_SECRET, SUPABASE_PUBLISHABLE].find(ehChave) ?? ''
  const { data: { user } } = await createClient(SUPABASE_URL, keyUsada).auth.getUser(token)
  if (!user || user.user_metadata?.role !== 'admin_sistema') return Response.json({ error: 'Acesso restrito ao administrador do sistema.' }, { status: 403 })

  let descricao = '', segmentos: string[] = []
  try {
    const body = await req.json()
    descricao = (body.descricao ?? '').toString().trim()
    segmentos = Array.isArray(body.segmentos) ? body.segmentos.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean) : []
  } catch { return Response.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!descricao) return Response.json({ error: 'Descreva o checklist que deseja gerar.' }, { status: 400 })

  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET)
  const { data: provDb } = await admin.from('ia_provedores')
    .select('provedor, api_key, modelo, base_url, ativo, ordem').eq('ativo', true).order('ordem', { ascending: true })
  const cfg = new Map((provDb ?? []).map((p: any) => [p.provedor, p]))
  const k = (prov: string, env?: string) => cfg.get(prov)?.api_key || env
  const m = (prov: string, env: string | undefined, padrao: string) => cfg.get(prov)?.modelo || env || padrao
  const prompt: Mensagem = { system: SYSTEM, user: `Gere um checklist para: ${descricao}${segmentos.length ? `\nSegmento(s): ${segmentos.join(', ')}` : ''}` }

  const cand: { nome: string; modelo: string; run: () => Promise<string> }[] = []
  const gk = k('gemini', process.env.GEMINI_API_KEY); const gM = m('gemini', process.env.GEMINI_MODEL, 'gemini-2.5-flash')
  if (gk) cand.push({ nome: 'gemini', modelo: gM, run: () => gemini(gk, gM, prompt) })
  const ak = k('anthropic', process.env.ANTHROPIC_API_KEY); const aM = m('anthropic', process.env.ANTHROPIC_MODEL, 'claude-3-5-haiku-20241022')
  if (ak) cand.push({ nome: 'anthropic', modelo: aM, run: () => anthropic(ak, aM, prompt) })
  const ok = k('openai', process.env.OPENAI_API_KEY); const oM = m('openai', process.env.OPENAI_MODEL, 'gpt-4o-mini')
  if (ok) cand.push({ nome: 'openai', modelo: oM, run: () => openaiCompat('https://api.openai.com/v1', ok, oM, prompt) })
  const grk = k('groq', process.env.GROQ_API_KEY); const grM = m('groq', process.env.GROQ_MODEL, 'llama-3.1-8b-instant')
  if (grk) cand.push({ nome: 'groq', modelo: grM, run: () => openaiCompat('https://api.groq.com/openai/v1', grk, grM, prompt) })
  for (const cn of ['custom1', 'custom2']) {
    const ck = cfg.get(cn)?.api_key, cu = cfg.get(cn)?.base_url, cm = cfg.get(cn)?.modelo
    if (ck && cu && cm) cand.push({ nome: cn, modelo: cm, run: () => openaiCompat(cu, ck, cm, prompt) })
  }
  const ordem = (provDb ?? []).map((p: any) => p.provedor)
  cand.sort((a, b) => (ordem.indexOf(a.nome) === -1 ? 99 : ordem.indexOf(a.nome)) - (ordem.indexOf(b.nome) === -1 ? 99 : ordem.indexOf(b.nome)))
  if (!cand.length) return Response.json({ error: 'Nenhum provedor de IA configurado.' }, { status: 400 })

  let dados: any = null
  for (const c of cand) {
    try {
      dados = parseJson(await c.run())
      if (dados?.secoes?.length) break
    } catch (e: any) {
      admin.from('ia_falhas').insert({ contexto: 'template', provedor: c.nome, modelo: c.modelo, erro: String(e?.message ?? e).slice(0, 500) }).then(() => {}, () => {})
      dados = null
    }
  }
  if (!dados?.secoes?.length) return Response.json({ error: 'A IA não retornou um checklist válido. Tente refinar a descrição.' }, { status: 502 })

  // ── Cria o template (rascunho) ──
  const nome = String(dados.nome || descricao).slice(0, 120)
  const { data: tpl, error: tErr } = await admin.from('checklists').insert({
    unidade_id: null, nome, descricao: dados.descricao ? String(dados.descricao).slice(0, 300) : null,
    status: 'rascunho', is_template: true, template_segmentos: segmentos, criado_por: user.id,
  }).select('id').single()
  if (tErr || !tpl) return Response.json({ error: `Erro ao criar template: ${tErr?.message ?? ''}` }, { status: 500 })

  const secoes = Array.isArray(dados.secoes) ? dados.secoes.slice(0, 8) : []
  for (let si = 0; si < secoes.length; si++) {
    const sec = secoes[si]
    const { data: secRow } = await admin.from('checklist_secoes')
      .insert({ checklist_id: tpl.id, nome: String(sec.nome || `Seção ${si + 1}`).slice(0, 120), ordem: si }).select('id').single()
    if (!secRow) continue
    const atvs = Array.isArray(sec.atividades) ? sec.atividades.slice(0, 20) : []
    for (let ai = 0; ai < atvs.length; ai++) {
      const a = atvs[ai]
      const tipo = TIPOS_OK.includes(a?.tipo) ? a.tipo : 'texto'
      const { data: atvRow } = await admin.from('checklist_atividades').insert({
        checklist_id: tpl.id, secao_id: secRow.id, nome: String(a?.nome || 'Atividade').slice(0, 200),
        tipo, ordem: ai, obrigatoria: a?.obrigatoria !== false, critica: !!a?.critica,
        gera_plano_acao: !!a?.gera_plano_acao, config: (a?.config && typeof a.config === 'object') ? a.config : {},
      }).select('id').single()
      if (atvRow && tipo === 'multipla_escolha' && Array.isArray(a?.opcoes)) {
        const ops = a.opcoes.slice(0, 12).map((o: any, oi: number) => ({
          atividade_id: atvRow.id, label: String(o?.label || o?.valor || `Opção ${oi + 1}`).slice(0, 120),
          valor: String(o?.valor || o?.label || `op${oi + 1}`).slice(0, 120), ordem: oi, e_valido: o?.e_valido !== false,
        }))
        if (ops.length) await admin.from('checklist_atividade_opcoes').insert(ops)
      }
    }
  }

  return Response.json({ ok: true, id: tpl.id })
}
