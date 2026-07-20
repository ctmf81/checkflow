import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { compilarExecucoesMarkdown, type ExecucaoCompilar } from '@/lib/relatorios/compilarExecucoes'
import { assertUrlPublica } from '@/lib/urlExterna'

// Gera (assíncrono) o RELATÓRIO das execuções de um checklist numa janela de
// tempo, via IA. Fluxo: valida auth + permissão 'relatorios/executar' + gate da
// característica `ia` + cota + carência (empresa_pode_criar) → insere
// relatorios_gerados (status='gerando') e devolve o id NA HORA. A geração roda
// em background (fire-and-forget; o servidor Railway é um processo Node
// persistente) e atualiza a linha para 'pronto'/'erro'. O front faz polling.
// Reusa a infra multimodal/failover das outras rotas de IA (texto, não-stream).

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const PERFIL_ADMIN_EMPRESA = '00000000-0000-0000-0000-000000000002'

interface Resultado { texto: string; usage?: { tokensIn: number; tokensOut: number } }

async function runGemini(apiKey: string, model: string, sys: string, pergunta: string): Promise<Resultado> {
  const gen = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model })
  const r = await gen.generateContent([{ text: sys }, { text: pergunta }])
  const resp = await r.response
  const u = resp.usageMetadata
  return { texto: resp.text() ?? '', usage: u ? { tokensIn: u.promptTokenCount ?? 0, tokensOut: u.candidatesTokenCount ?? 0 } : undefined }
}

async function runAnthropic(apiKey: string, model: string, sys: string, pergunta: string): Promise<Resultado> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 2048, system: sys, messages: [{ role: 'user', content: [{ type: 'text', text: pergunta }] }] }),
  })
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`)
  const j = await res.json()
  const texto = (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
  return { texto, usage: j.usage ? { tokensIn: j.usage.input_tokens ?? 0, tokensOut: j.usage.output_tokens ?? 0 } : undefined }
}

async function runOpenAICompat(baseUrl: string, apiKey: string, model: string, sys: string, pergunta: string): Promise<Resultado> {
  await assertUrlPublica(baseUrl) // guard SSRF (base_url de ia_provedores)
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [
      { role: 'system', content: sys },
      { role: 'user', content: pergunta },
    ] }),
  })
  if (!res.ok) throw new Error(`OpenAI-compat HTTP ${res.status}`)
  const j = await res.json()
  return { texto: j.choices?.[0]?.message?.content ?? '', usage: j.usage ? { tokensIn: j.usage.prompt_tokens ?? 0, tokensOut: j.usage.completion_tokens ?? 0 } : undefined }
}

function erro(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}

// ── Permissão do usuário (service role ignora RLS → checa na mão) ──
async function podeExecutar(sb: SupabaseClient, userId: string, empresaId: string, ehAdminSistema: boolean): Promise<boolean> {
  if (ehAdminSistema) return true
  const { data: ue } = await sb.from('usuario_empresa').select('perfil_id').eq('usuario_id', userId).eq('empresa_id', empresaId).maybeSingle()
  if (!ue?.perfil_id) return false
  if (ue.perfil_id === PERFIL_ADMIN_EMPRESA) return true
  const { data: pp } = await sb.from('perfil_permissoes').select('permissao:permissao_id(recurso, acao)').eq('perfil_id', ue.perfil_id)
  return (pp ?? []).some((row: any) => {
    const p = Array.isArray(row.permissao) ? row.permissao[0] : row.permissao
    return p?.recurso === 'relatorios' && p?.acao === 'executar'
  })
}

export async function POST(req: NextRequest) {
  if (!SUPABASE_SECRET) return erro('Indisponível', 500)
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return erro('Não autenticado', 401)

  const ehChave = (k: string) => !!k && !k.startsWith('http')
  const keyPublica = [SUPABASE_PUBLISHABLE, SUPABASE_SECRET].find(ehChave) ?? ''
  const supabasePublic = createClient(SUPABASE_URL, keyPublica)
  const { data: { user } } = await supabasePublic.auth.getUser(token)
  if (!user) return erro('Sessão inválida', 401)
  const ehAdminSistema = user.app_metadata?.role === 'admin_sistema'

  const body = await req.json().catch(() => ({}))
  const modeloId = body.modelo_id
  if (!modeloId) return erro('modelo_id é obrigatório', 400)

  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET)

  // Modelo + checklist
  const { data: modelo } = await sb.from('relatorio_modelos')
    .select('id, unidade_id, checklist_id, nome, periodo_horas, prompt, checklists(nome)')
    .eq('id', modeloId).single()
  if (!modelo) return erro('Modelo de relatório não encontrado', 404)

  const { data: unidade } = await sb.from('unidades').select('empresa_id').eq('id', modelo.unidade_id).single()
  const empresaId = unidade?.empresa_id as string | undefined
  if (!empresaId) return erro('Unidade sem empresa', 422)

  // Permissão de executar
  if (!(await podeExecutar(sb, user.id, empresaId, ehAdminSistema))) {
    return erro('Você não tem permissão para gerar relatórios.', 403)
  }

  // Carência / pós-trial: gerar cria conteúdo novo → bloqueia em somente-leitura
  if (!ehAdminSistema) {
    const { data: podeCriar } = await sb.rpc('empresa_pode_criar', { p_empresa_id: empresaId })
    if (podeCriar === false) {
      return erro('Sua assinatura está em modo somente-leitura. Contrate um plano para gerar relatórios.', 402)
    }
  }

  // Gate: característica `ia` no plano + cota de tokens
  const { data: assin } = await sb.from('empresa_assinaturas').select('plano_id').eq('empresa_id', empresaId).maybeSingle()
  if (assin?.plano_id) {
    const { data: ps } = await sb.from('plano_servicos').select('servico:servico_id(flag, tipo, ativo)').eq('plano_id', assin.plano_id)
    if (ps && ps.length > 0) {
      const temIA = ps.some((row: any) => {
        const s = Array.isArray(row.servico) ? row.servico[0] : row.servico
        return s?.ativo && s?.tipo === 'caracteristica' && s?.flag === 'ia'
      })
      if (!temIA) return erro('Os Serviços de IA não estão incluídos no seu plano.', 402)
    }
  }
  const { data: podeIA } = await sb.rpc('billing_pode_consumir_ia', { p_empresa_id: empresaId })
  if (podeIA === false) return erro('Limite de tokens de IA do plano atingido neste período.', 402)

  // Janela de tempo real
  const ate = new Date()
  const de = new Date(ate.getTime() - modelo.periodo_horas * 60 * 60 * 1000)

  // Cria a linha 'gerando' e devolve o id imediatamente
  const { data: gerado, error: insErr } = await sb.from('relatorios_gerados').insert({
    modelo_id: modelo.id,
    unidade_id: modelo.unidade_id,
    status: 'gerando',
    periodo_de: de.toISOString(),
    periodo_ate: ate.toISOString(),
    gerado_por: user.id,
  }).select('id').single()
  if (insErr || !gerado) return erro('Não foi possível iniciar o relatório.', 500)

  const checklistNome = (Array.isArray(modelo.checklists) ? modelo.checklists[0] : modelo.checklists)?.nome ?? 'Checklist'

  // Geração em background (não bloqueia a resposta)
  void gerarRelatorio(sb, {
    relatorioId: gerado.id,
    empresaId,
    unidadeId: modelo.unidade_id,
    checklistId: modelo.checklist_id,
    checklistNome,
    periodoHoras: modelo.periodo_horas,
    prompt: modelo.prompt ?? '',
    de, ate,
    usuarioId: user.id,
  })

  return new Response(JSON.stringify({ id: gerado.id, status: 'gerando' }), { headers: { 'Content-Type': 'application/json' } })
}

// ── Geração assíncrona ────────────────────────────────────────────────────────
interface GerarCtx {
  relatorioId: string
  empresaId: string
  unidadeId: string
  checklistId: string
  checklistNome: string
  periodoHoras: number
  prompt: string
  de: Date
  ate: Date
  usuarioId: string
}

async function gerarRelatorio(sb: SupabaseClient, ctx: GerarCtx) {
  try {
    // 1. Execuções concluídas na janela
    const { data: execs } = await sb.from('checklist_execucoes')
      .select('id, data_execucao, resultado, executado_por')
      .eq('checklist_id', ctx.checklistId)
      .eq('unidade_id', ctx.unidadeId)
      .eq('status', 'concluido')
      .gte('data_execucao', ctx.de.toISOString())
      .lte('data_execucao', ctx.ate.toISOString())
      .order('data_execucao', { ascending: false })

    const execRows = (execs ?? []) as any[]
    const execIds = execRows.map(e => e.id)

    // 2. Respostas + atividades + executores (em paralelo)
    const [respRes, atvRes, usrRes] = await Promise.all([
      execIds.length
        ? sb.from('checklist_execucao_respostas').select('execucao_id, atividade_id, resposta, conforme').in('execucao_id', execIds)
        : Promise.resolve({ data: [] as any[] }),
      sb.from('checklist_atividades').select('id, nome, tipo').eq('checklist_id', ctx.checklistId),
      (() => {
        const ids = [...new Set(execRows.map(e => e.executado_por).filter(Boolean))]
        return ids.length ? sb.from('usuarios').select('id, nome').in('id', ids) : Promise.resolve({ data: [] as any[] })
      })(),
    ])
    const atvMap = new Map((atvRes.data ?? []).map((a: any) => [a.id, a]))
    const usrMap = new Map((usrRes.data ?? []).map((u: any) => [u.id, u.nome]))
    const respPorExec = new Map<string, any[]>()
    for (const r of (respRes.data ?? []) as any[]) {
      const arr = respPorExec.get(r.execucao_id) ?? []
      arr.push(r)
      respPorExec.set(r.execucao_id, arr)
    }

    const execucoes: ExecucaoCompilar[] = execRows.map(e => ({
      data_execucao: e.data_execucao,
      resultado: e.resultado,
      executor_nome: e.executado_por ? (usrMap.get(e.executado_por) ?? null) : null,
      respostas: (respPorExec.get(e.id) ?? []).map((r: any) => {
        const atv = atvMap.get(r.atividade_id)
        return { atividade_nome: atv?.nome ?? 'Atividade', tipo: atv?.tipo ?? 'texto', resposta: r.resposta, conforme: r.conforme }
      }),
    }))

    const markdown = compilarExecucoesMarkdown(ctx.checklistNome, ctx.periodoHoras, ctx.de.toISOString(), ctx.ate.toISOString(), execucoes)

    // 3. IA (failover de provedores — texto)
    const sys = 'Você é um analista que gera relatórios gerenciais claros e objetivos, em português e em markdown, a partir de dados de execuções de checklists. Baseie-se exclusivamente nos dados fornecidos; organize por seção e destaque não conformidades e tendências.'
    const pergunta = `${(ctx.prompt || '').trim()}\n\n--- DADOS DAS EXECUÇÕES ---\n${markdown}`

    const { data: provDb } = await sb.from('ia_provedores').select('provedor, api_key, modelo, base_url, ativo, ordem').eq('ativo', true).order('ordem', { ascending: true })
    const cfgP = new Map((provDb ?? []).map((p: any) => [p.provedor, p]))
    const key = (p: string, env?: string) => cfgP.get(p)?.api_key || env
    const mod = (p: string, env: string | undefined, def: string) => cfgP.get(p)?.modelo || env || def

    const candidatos: { nome: string; run: () => Promise<Resultado>; modelo: string }[] = []
    const push = (nome: string, k: string | undefined, modelo: string, run: () => Promise<Resultado>) => { if (k) candidatos.push({ nome, run, modelo }) }
    const gK = key('gemini', process.env.GEMINI_API_KEY), gM = mod('gemini', process.env.GEMINI_MODEL, 'gemini-2.5-flash')
    const aK = key('anthropic', process.env.ANTHROPIC_API_KEY), aM = mod('anthropic', process.env.ANTHROPIC_MODEL, 'claude-3-5-haiku-20241022')
    const oK = key('openai', process.env.OPENAI_API_KEY), oM = mod('openai', process.env.OPENAI_MODEL, 'gpt-4o-mini')
    const qK = key('groq', process.env.GROQ_API_KEY), qM = mod('groq', process.env.GROQ_MODEL, 'llama-3.3-70b-versatile')
    push('gemini', gK, gM, () => runGemini(gK!, gM, sys, pergunta))
    push('anthropic', aK, aM, () => runAnthropic(aK!, aM, sys, pergunta))
    push('openai', oK, oM, () => runOpenAICompat('https://api.openai.com/v1', oK!, oM, sys, pergunta))
    push('groq', qK, qM, () => runOpenAICompat('https://api.groq.com/openai/v1', qK!, qM, sys, pergunta))
    const ordem = (provDb ?? []).map((p: any) => p.provedor)
    candidatos.sort((a, b) => (ordem.indexOf(a.nome) === -1 ? 99 : ordem.indexOf(a.nome)) - (ordem.indexOf(b.nome) === -1 ? 99 : ordem.indexOf(b.nome)))

    if (candidatos.length === 0) {
      await sb.from('relatorios_gerados').update({ status: 'erro', erro_msg: 'Nenhum provedor de IA configurado.' }).eq('id', ctx.relatorioId)
      return
    }

    let conteudo = ''
    let usado: { nome: string; modelo: string; usage?: Resultado['usage'] } | null = null
    for (const c of candidatos) {
      try {
        const r = await c.run()
        conteudo = (r.texto ?? '').trim()
        usado = { nome: c.nome, modelo: c.modelo, usage: r.usage }
        break
      } catch (err: any) {
        sb.from('ia_falhas').insert({ contexto: 'relatorio', provedor: c.nome, modelo: c.modelo, erro: String(err?.message ?? err).slice(0, 500), empresa_id: ctx.empresaId }).then(() => {}, () => {})
      }
    }

    if (!usado || !conteudo) {
      await sb.from('relatorios_gerados').update({ status: 'erro', erro_msg: 'Os serviços de IA estão indisponíveis no momento. Tente novamente.' }).eq('id', ctx.relatorioId)
      return
    }

    await sb.from('relatorios_gerados').update({ status: 'pronto', conteudo }).eq('id', ctx.relatorioId)

    if (usado.usage) {
      await sb.from('uso_ia_eventos').insert({
        empresa_id: ctx.empresaId, unidade_id: ctx.unidadeId, usuario_id: ctx.usuarioId,
        provedor: usado.nome, modelo: usado.modelo,
        tokens_entrada: usado.usage.tokensIn, tokens_saida: usado.usage.tokensOut,
      })
    }
  } catch (err: any) {
    await sb.from('relatorios_gerados').update({ status: 'erro', erro_msg: String(err?.message ?? err).slice(0, 300) }).eq('id', ctx.relatorioId).then(() => {}, () => {})
  }
}
