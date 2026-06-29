// Motor de geração de checklist por IA, compartilhado entre:
//  - /api/templates/gerar  (cria TEMPLATE rascunho p/ admin de sistema)
//  - /api/empresas/checklist-inicial (cria checklist PUBLICADO escopado à
//    unidade/subgrupo no setup de uma nova empresa)
//
// Reaproveita os provedores de ia_provedores (failover por ordem) + chaves de
// env. Não consome tokens de empresa. Os tipos de atividade são restritos aos
// que NÃO dependem de cadastro prévio (catálogo e padrão ficam de fora).

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const TIPOS_CHECKLIST = ['sim_nao', 'numero', 'texto', 'foto', 'data_hora', 'multipla_escolha']

export interface OpcaoIA { label?: string; valor?: string; e_valido?: boolean }
export interface AtividadeIA {
  nome?: string
  tipo?: string
  obrigatoria?: boolean
  critica?: boolean
  gera_plano_acao?: boolean
  config?: Record<string, unknown>
  opcoes?: OpcaoIA[]
}
export interface SecaoIA { nome?: string; atividades?: AtividadeIA[] }
export interface EstruturaChecklistIA { nome?: string; descricao?: string; secoes?: SecaoIA[] }

function buildSystem(minSecoes: number, maxSecoes: number): string {
  const regraSecoes = minSecoes === maxSecoes
    ? `Gere EXATAMENTE ${minSecoes} seções`
    : `Gere de ${minSecoes} a ${maxSecoes} seções`
  return `Você cria modelos de checklist operacional para o CheckFlow. Responda ESTRITAMENTE com um JSON válido (sem markdown, sem comentários, sem texto fora do JSON) no formato:
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
- Use SOMENTE estes tipos: sim_nao, numero, texto, foto, data_hora, multipla_escolha. NUNCA use "catalogo" nem "padrao" (dependem de cadastro prévio).
- Para tipo "sim_nao": config = {"esperado":"sim"} (ou "nao"), o valor que representa conformidade.
- Para tipo "numero": config = {"min":N,"max":N,"unidade":"texto curto"} quando fizer sentido (ex: temperatura).
- Para tipo "multipla_escolha": preencha "opcoes" = [{"label":"texto","valor":"texto","e_valido":true}] (e_valido=false reprova se escolhida).
- Demais tipos: config = {}, opcoes = [].
- Marque "critica": true e "gera_plano_acao": true em itens de risco/segurança que, se reprovados, devem reprovar o checklist e abrir plano de ação.
- ${regraSecoes}, cada uma com 2 a 8 atividades, claras e específicas do contexto pedido. Português do Brasil.`
}

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
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const i = t.indexOf('{'), j = t.lastIndexOf('}')
  if (i >= 0 && j > i) t = t.slice(i, j + 1)
  return JSON.parse(t)
}

/**
 * Gera a estrutura do checklist via IA com failover de provedores. Retorna o
 * objeto parseado ({nome, descricao, secoes}) ou null se nenhum provedor
 * devolveu um JSON válido com seções.
 */
export async function gerarEstruturaChecklist(params: {
  descricao: string
  segmentos?: string[]
  minSecoes?: number
  maxSecoes?: number
  contexto?: string // categoria registrada em ia_falhas (ex.: 'template' | 'checklist')
}): Promise<EstruturaChecklistIA | null> {
  const { descricao, segmentos = [], minSecoes = 2, maxSecoes = 6, contexto = 'checklist' } = params
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET)
  const { data: provDb } = await admin.from('ia_provedores')
    .select('provedor, api_key, modelo, base_url, ativo, ordem').eq('ativo', true).order('ordem', { ascending: true })
  const cfg = new Map((provDb ?? []).map((p: any) => [p.provedor, p]))
  const k = (prov: string, env?: string) => cfg.get(prov)?.api_key || env
  const m = (prov: string, env: string | undefined, padrao: string) => cfg.get(prov)?.modelo || env || padrao
  const prompt: Mensagem = {
    system: buildSystem(minSecoes, maxSecoes),
    user: `Gere um checklist para: ${descricao}${segmentos.length ? `\nSegmento(s): ${segmentos.join(', ')}` : ''}`,
  }

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
  if (!cand.length) return null

  for (const c of cand) {
    try {
      const dados = parseJson(await c.run())
      if (dados?.secoes?.length) return dados
    } catch (e: any) {
      admin.from('ia_falhas').insert({ contexto, provedor: c.nome, modelo: c.modelo, erro: String(e?.message ?? e).slice(0, 500) }).then(() => {}, () => {})
    }
  }
  return null
}
