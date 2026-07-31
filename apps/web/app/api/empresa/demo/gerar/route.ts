import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { autorizarPermissao } from '@/lib/apiAuth'
import { verticalPorId } from '@/lib/demo/verticais'
import { validarTemplate } from '@/lib/demo/validarTemplate'
import {
  criarRng, sortearDatas, sortearStatus, sortearDesfecho,
  resultadoDoDesfecho, temPlano, statusPlanoDoDesfecho, escolher,
} from '@/lib/demo/gerador'
import { configAtividade, atividadeValida, gerarResposta } from '@/lib/demo/respostas'
import type { VerticalTemplate, ChecklistTemplate, AtividadeTemplate, PapelDemo } from '@/lib/demo/tipos'

// Total de execuções por rodada de "Gerar dados" (fixo, independe do nº de checklists).
const TOTAL_EXECUCOES = 80

// Gerador de dados de demonstração (append, janela 30 dias).
// BLINDADO pela flag empresas.demo — nunca roda em empresa pagante.
// Provisiona a estrutura da vertical (idempotente) e ACRESCENTA execuções +
// respostas + planos de ação. Tickets/tarefas/causa raiz são provisionados
// uma vez. Service-role (bypassa RLS); os dados saem no formato que as telas leem.

export const maxDuration = 300

const PERFIL_OPERACAO = '00000000-0000-0000-0000-000000000003'
const PERFIL_ADMIN_EMPRESA = '00000000-0000-0000-0000-000000000002'
const SENHA_DEMO = 'Demo@2026'

function admin(): SupabaseClient | null {
  // Mesma resolução robusta do resto das rotas server (nomes de env variam por
  // ambiente): URL com fallback, chave aceitando os dois nomes usados.
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const url = envUrl.includes('.supabase.co') ? envUrl : 'https://pswdjdlirylxgscohcfi.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  if (!key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const so = (v: string) => v.replace(/\D/g, '') // só dígitos

interface Ctx {
  sb: SupabaseClient
  empresaId: string
  tpl: VerticalTemplate
  unidadeId: string
  operadorAuthId: string // executado_por
  operadorUsuarioId: string // criado_por dos planos (= auth id)
  // nome do subgrupo → id
  subgrupoIds: Map<string, string>
  grupoIds: Map<string, string>
  catalogoValores: Map<string, string[]> // nome catálogo → chaves
  catalogoIds: Map<string, string>
  perfilCoordenadorId: string
  perfilGestaoId: string
}

// ── get-or-create helpers ──────────────────────────────────────────────────

async function acharUnidade(sb: SupabaseClient, empresaId: string, nome: string): Promise<string> {
  const { data } = await sb.from('unidades').select('id').eq('empresa_id', empresaId).eq('nome', nome).maybeSingle()
  if (data) return data.id
  const { data: nova, error } = await sb.from('unidades').insert({ empresa_id: empresaId, nome, status: 'ativo' }).select('id').single()
  if (error || !nova) throw new Error(`unidade "${nome}": ${error?.message}`)
  return nova.id
}

async function acharGrupo(sb: SupabaseClient, unidadeId: string, nome: string): Promise<string> {
  const { data } = await sb.from('grupos').select('id').eq('unidade_id', unidadeId).eq('nome', nome).maybeSingle()
  if (data) return data.id
  const { data: novo, error } = await sb.from('grupos').insert({ unidade_id: unidadeId, nome, status: 'ativo' }).select('id').single()
  if (error || !novo) throw new Error(`grupo "${nome}": ${error?.message}`)
  return novo.id
}

async function acharSubgrupo(sb: SupabaseClient, grupoId: string, nome: string): Promise<string> {
  const { data } = await sb.from('subgrupos').select('id').eq('grupo_id', grupoId).eq('nome', nome).maybeSingle()
  if (data) return data.id
  const { data: novo, error } = await sb.from('subgrupos').insert({ grupo_id: grupoId, nome, status: 'ativo' }).select('id').single()
  if (error || !novo) throw new Error(`subgrupo "${nome}": ${error?.message}`)
  return novo.id
}

async function provisionarCatalogos(ctx: Ctx) {
  for (const c of ctx.tpl.catalogos) {
    let { data: cat } = await ctx.sb.from('catalogos').select('id').eq('unidade_id', ctx.unidadeId).eq('nome', c.nome).maybeSingle()
    if (!cat) {
      const attrs = c.atributos
      const { data: novo, error } = await ctx.sb.from('catalogos').insert({
        unidade_id: ctx.unidadeId, nome: c.nome, campo_chave: c.campoChave,
        atributo_1: attrs[0] ?? null, atributo_2: attrs[1] ?? null, atributo_3: attrs[2] ?? null, atributo_4: attrs[3] ?? null,
        status: 'ativo',
      }).select('id').single()
      if (error || !novo) throw new Error(`catálogo "${c.nome}": ${error?.message}`)
      cat = novo
      // valores
      const linhas = c.itens.map(item => ({
        catalogo_id: cat!.id,
        valor_chave: item[c.campoChave] ?? '',
        atributo_1: c.atributos[0] ? item[c.atributos[0]] ?? null : null,
        atributo_2: c.atributos[1] ? item[c.atributos[1]] ?? null : null,
        atributo_3: c.atributos[2] ? item[c.atributos[2]] ?? null : null,
        atributo_4: c.atributos[3] ? item[c.atributos[3]] ?? null : null,
      }))
      if (linhas.length) await ctx.sb.from('catalogo_valores').insert(linhas)
    }
    ctx.catalogoIds.set(c.nome, cat.id)
    ctx.catalogoValores.set(c.nome, c.itens.map(i => i[c.campoChave] ?? '').filter(Boolean))
  }
}

/** Cria (ou acha) um usuário demo: auth + usuarios + vínculos. Retorna auth id. */
async function acharUsuario(ctx: Ctx, nome: string, cpf: string, perfilId: string, funcao: string): Promise<string> {
  const cpfDigits = so(cpf)
  const email = `${cpfDigits}@demo.checkflow.local`
  // já existe?
  const { data: u } = await ctx.sb.from('usuarios').select('id').eq('email', email).maybeSingle()
  let authId = u?.id as string | undefined
  if (!authId) {
    const { data: created, error } = await ctx.sb.auth.admin.createUser({
      email, password: SENHA_DEMO, email_confirm: true, user_metadata: { nome, demo: true },
    })
    if (error || !created?.user) throw new Error(`auth "${nome}": ${error?.message}`)
    authId = created.user.id
    await ctx.sb.from('usuarios').insert({
      id: authId, nome, email, cpf: cpfDigits, telefone: '11999990000', status: 'ativo', primeiro_acesso: false,
    })
  }
  // vínculos (idempotentes via upsert/ignore)
  await ctx.sb.from('usuario_empresa').upsert({ usuario_id: authId, empresa_id: ctx.empresaId, perfil_id: perfilId }, { onConflict: 'usuario_id,empresa_id' })
  await ctx.sb.from('usuario_unidade').upsert({ usuario_id: authId, unidade_id: ctx.unidadeId }, { onConflict: 'usuario_id,unidade_id' })
  for (const subId of ctx.subgrupoIds.values()) {
    await ctx.sb.from('usuario_subgrupo').upsert({ usuario_id: authId, subgrupo_id: subId, funcao }, { onConflict: 'usuario_id,subgrupo_id' })
  }
  return authId
}

/**
 * Resolve os perfis dos usuários demo:
 *  • Operação e Admin da empresa: perfis de SISTEMA (globais, ids fixos).
 *  • Gestão do Grupo: semeado por trigger ao criar a empresa (per-empresa).
 *  • Coordenador: criado aqui (idempotente), com as mesmas permissões do
 *    Gestão do Grupo — é o moderador N1.
 */
async function resolverPerfis(ctx: Ctx) {
  const { data: gg } = await ctx.sb.from('perfis').select('id')
    .eq('empresa_id', ctx.empresaId).eq('nome', 'Gestão do Grupo').maybeSingle()
  ctx.perfilGestaoId = gg?.id ?? PERFIL_ADMIN_EMPRESA

  let { data: coord } = await ctx.sb.from('perfis').select('id')
    .eq('empresa_id', ctx.empresaId).eq('nome', 'Coordenador').maybeSingle()
  if (!coord) {
    const { data: novo } = await ctx.sb.from('perfis').insert({
      nome: 'Coordenador',
      descricao: 'Coordenação de área — modera planos de ação (N1) e acompanha a operação.',
      empresa_id: ctx.empresaId, is_system: false, publico: false,
    }).select('id').single()
    coord = novo
    if (coord && gg?.id) {
      const { data: perms } = await ctx.sb.from('perfil_permissoes').select('permissao_id').eq('perfil_id', gg.id)
      if (perms?.length) {
        await ctx.sb.from('perfil_permissoes').insert(
          perms.map(p => ({ perfil_id: coord!.id, permissao_id: p.permissao_id })),
        )
      }
    }
  }
  ctx.perfilCoordenadorId = coord?.id ?? PERFIL_ADMIN_EMPRESA
}

async function provisionarUsuarios(ctx: Ctx) {
  await resolverPerfis(ctx)
  const mapa: Record<PapelDemo, { perfil: string; funcao: string }> = {
    operador: { perfil: PERFIL_OPERACAO, funcao: 'operacao' },
    coordenador: { perfil: ctx.perfilCoordenadorId, funcao: 'nivel_1' },
    gestor: { perfil: ctx.perfilGestaoId, funcao: 'nivel_2' },
    admin: { perfil: PERFIL_ADMIN_EMPRESA, funcao: 'nivel_2' },
  }
  for (const usr of ctx.tpl.usuarios) {
    const cfg = mapa[usr.papel]
    const authId = await acharUsuario(ctx, usr.nome, usr.cpf, cfg.perfil, cfg.funcao)
    if (usr.papel === 'operador') { ctx.operadorAuthId = authId; ctx.operadorUsuarioId = authId }
  }
  if (!ctx.operadorAuthId) throw new Error('template sem operador')
}

/** Em modo 'dados': acha o auth id do operador (autor das execuções/planos). */
async function resolverOperador(ctx: Ctx) {
  const op = ctx.tpl.usuarios.find(u => u.papel === 'operador')
  if (!op) throw new Error('template sem operador')
  const { data } = await ctx.sb.from('usuarios').select('id').eq('cpf', so(op.cpf)).maybeSingle()
  if (!data) throw new Error('operador não encontrado — gere a estrutura primeiro')
  ctx.operadorAuthId = data.id
  ctx.operadorUsuarioId = data.id
}

interface ChecklistProvisionado { id: string; secaoId: string; atividades: { id: string; tpl: AtividadeTemplate }[]; tpl: ChecklistTemplate }

/** Provisiona um checklist publicado com seções/atividades/opções/versão. */
async function provisionarChecklist(ctx: Ctx, cl: ChecklistTemplate): Promise<ChecklistProvisionado> {
  const subgrupoId = ctx.subgrupoIds.get(cl.subgrupo)!
  // já existe (por nome+subgrupo)?
  const { data: existente } = await ctx.sb.from('checklists').select('id').eq('unidade_id', ctx.unidadeId).eq('subgrupo_id', subgrupoId).eq('nome', cl.nome).maybeSingle()

  let checklistId = existente?.id as string | undefined
  const atividades: { id: string; tpl: AtividadeTemplate }[] = []
  let secaoId = ''

  if (!checklistId) {
    const { data: novo, error } = await ctx.sb.from('checklists').insert({
      unidade_id: ctx.unidadeId, subgrupo_id: subgrupoId, nome: cl.nome,
      status: 'publicado', versao_atual: 1, criado_por: ctx.operadorUsuarioId,
    }).select('id').single()
    if (error || !novo) throw new Error(`checklist "${cl.nome}": ${error?.message}`)
    checklistId = novo.id

    let ordemSecao = 0
    for (const sec of cl.secoes) {
      const { data: s } = await ctx.sb.from('checklist_secoes').insert({ checklist_id: checklistId, nome: sec.nome, ordem: ordemSecao++ }).select('id').single()
      secaoId = s!.id
      let ordem = 0
      for (const a of sec.atividades) {
        const valida = atividadeValida(a)
        const { data: at } = await ctx.sb.from('checklist_atividades').insert({
          checklist_id: checklistId, secao_id: secaoId, nome: a.nome, tipo: a.tipo, ordem: ordem++,
          obrigatoria: true, critica: valida, gera_plano_acao: valida,
          config: configAtividade(a, ctx.catalogoIds.get(a.catalogo ?? '')),
        }).select('id').single()
        atividades.push({ id: at!.id, tpl: a })
        if (a.tipo === 'multipla_escolha' && a.opcoes) {
          const ops = a.opcoes.map((o, i) => ({ atividade_id: at!.id, label: o, valor: o, ordem: i, e_valido: (a.opcoesConformes ?? []).includes(o) }))
          await ctx.sb.from('checklist_atividade_opcoes').insert(ops)
        }
      }
    }
    // snapshot de versão (publicação)
    await ctx.sb.from('checklist_versoes').insert({
      checklist_id: checklistId, numero_versao: 1,
      snapshot: { nome: cl.nome, secoes: cl.secoes }, publicado_por: ctx.operadorUsuarioId,
    })
  } else {
    // já provisionado: carrega seção + atividades para atrelar execuções novas
    const { data: secs } = await ctx.sb.from('checklist_secoes').select('id').eq('checklist_id', checklistId).order('ordem').limit(1)
    secaoId = secs?.[0]?.id ?? ''
    const { data: ats } = await ctx.sb.from('checklist_atividades').select('id, nome').eq('checklist_id', checklistId).order('ordem')
    const porNome = new Map((ats ?? []).map(a => [a.nome, a.id]))
    for (const sec of cl.secoes) for (const a of sec.atividades) {
      const id = porNome.get(a.nome)
      if (id) atividades.push({ id, tpl: a })
    }
  }

  if (!checklistId) throw new Error(`checklist "${cl.nome}": id ausente`)
  return { id: checklistId, secaoId, atividades, tpl: cl }
}

async function provisionarCausaRaiz(ctx: Ctx) {
  const { count } = await ctx.sb.from('causa_raiz').select('id', { count: 'exact', head: true }).eq('unidade_id', ctx.unidadeId)
  if ((count ?? 0) > 0) return
  const linhas = ctx.tpl.causasRaiz.map(nome => ({ unidade_id: ctx.unidadeId, nome, status: 'ativo' }))
  if (linhas.length) await ctx.sb.from('causa_raiz').insert(linhas)
}

async function provisionarTicketsETarefas(ctx: Ctx) {
  const primeiroGrupo = ctx.tpl.estrutura[0]
  const grupoId = ctx.grupoIds.get(primeiroGrupo.grupo)!
  const subgrupoId = ctx.subgrupoIds.get(primeiroGrupo.subgrupos[0])!

  const { count: nTickets } = await ctx.sb.from('tickets').select('id', { count: 'exact', head: true }).eq('unidade_id', ctx.unidadeId)
  if ((nTickets ?? 0) === 0) {
    for (const t of ctx.tpl.tickets) {
      await ctx.sb.from('tickets').insert({
        unidade_id: ctx.unidadeId, grupo_id: grupoId, subgrupo_id: subgrupoId,
        titulo: t.titulo, descricao: t.descricao, prioridade: 'media', status: 'aberto',
        aberto_por_id: ctx.operadorAuthId,
      })
    }
  }

  const { count: nListas } = await ctx.sb.from('tarefa_listas').select('id', { count: 'exact', head: true }).eq('unidade_id', ctx.unidadeId)
  if ((nListas ?? 0) === 0) {
    for (const lst of ctx.tpl.tarefas) {
      const { data: lista } = await ctx.sb.from('tarefa_listas').insert({
        unidade_id: ctx.unidadeId, titulo: lst.titulo, status: 'publicada', criado_por: ctx.operadorUsuarioId,
      }).select('id').single()
      if (!lista) continue
      await ctx.sb.from('tarefa_lista_subgrupos').insert({ lista_id: lista.id, subgrupo_id: subgrupoId })
      await ctx.sb.from('tarefa_itens').insert(lst.itens.map((it, i) => ({ lista_id: lista.id, titulo: it, ordem: i })))
    }
  }
}

// ── Geração da massa (append) ───────────────────────────────────────────────

async function gerarMassa(ctx: Ctx, checklists: ChecklistProvisionado[]): Promise<{ execucoes: number; planos: number }> {
  const agora = new Date()
  let nExec = 0, nPlano = 0
  const rng = criarRng((Date.now() & 0xffff) + 7)

  // TOTAL_EXECUCOES execuções no total (não por checklist), espalhadas na janela.
  const datas = sortearDatas(agora, 30, TOTAL_EXECUCOES, 8, 18, rng)

  for (let i = 0; i < datas.length; i++) {
    const cp = checklists[i % checklists.length] // distribui entre os checklists
    const ts = datas[i]
    const subgrupoId = ctx.subgrupoIds.get(cp.tpl.subgrupo)!

    // Status variado: maioria concluída; algumas em andamento / não executadas.
    const status = sortearStatus(rng)
    const desfecho = status === 'concluido' ? sortearDesfecho(rng, cp.tpl.pesos) : null
    const resultado = desfecho ? resultadoDoDesfecho(desfecho) : null

    const { data: exec } = await ctx.sb.from('checklist_execucoes').insert({
      checklist_id: cp.id, unidade_id: ctx.unidadeId, executado_por: ctx.operadorAuthId,
      data_execucao: ts.toISOString(), status, resultado,
    }).select('id').single()
    if (!exec) continue
    nExec++

    // Só a concluída tem respostas e (eventualmente) plano de ação.
    if (status !== 'concluido' || !desfecho) continue

    const validas = cp.atividades.filter(a => atividadeValida(a.tpl))
    const idxReprova = resultado === 'reprovado' && validas.length ? escolher(rng, validas) : null
    let respostaNaoConformeId: string | null = null
    let atividadeNaoConformeId: string | null = null

    for (const at of cp.atividades) {
      const ehAReprovada = !!idxReprova && at.id === idxReprova.id
      const r = gerarResposta(at.tpl, !ehAReprovada, rng, ctx.catalogoValores.get(at.tpl.catalogo ?? ''))
      const { data: resp } = await ctx.sb.from('checklist_execucao_respostas').insert({
        execucao_id: exec.id, atividade_id: at.id, resposta: r.resposta as object, conforme: r.conforme,
      }).select('id').single()
      if (ehAReprovada && resp) { respostaNaoConformeId = resp.id; atividadeNaoConformeId = at.id }
    }

    // Plano de ação (aberto_notificado_em setado → cron não dispara WhatsApp).
    if (temPlano(desfecho) && respostaNaoConformeId && atividadeNaoConformeId) {
      await ctx.sb.from('planos_acao').insert({
        unidade_id: ctx.unidadeId, subgrupo_id: subgrupoId,
        checklist_execucao_id: exec.id, checklist_execucao_resposta_id: respostaNaoConformeId,
        atividade_id: atividadeNaoConformeId, status: statusPlanoDoDesfecho(desfecho)!,
        observacao_abertura: escolher(rng, ctx.tpl.motivosNaoConformidade),
        criado_por: ctx.operadorUsuarioId, aberto_notificado_em: new Date().toISOString(),
        created_at: ts.toISOString(), updated_at: ts.toISOString(),
      })
      nPlano++
    }
  }
  return { execucoes: nExec, planos: nPlano }
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const authz = await autorizarPermissao(req, 'empresas', 'editar')
    if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: authz.status })

    const body = await req.json()
    const empresaId = body?.empresaId as string | undefined
    const modo = (body?.modo === 'dados' ? 'dados' : 'estrutura') as 'estrutura' | 'dados'
    if (!empresaId) return NextResponse.json({ message: 'empresaId é obrigatório.' }, { status: 400 })

    const sb = admin()
    if (!sb) return NextResponse.json({ message: 'Configuração ausente.' }, { status: 500 })

    // GUARD: só empresa demo.
    const { data: empresa } = await sb.from('empresas').select('demo, demo_vertical, demo_provisionado').eq('id', empresaId).maybeSingle()
    if (!empresa) return NextResponse.json({ message: 'Empresa não encontrada.' }, { status: 404 })
    if (!empresa.demo) return NextResponse.json({ message: 'Esta empresa não é de demonstração. O gerador não roda aqui.' }, { status: 403 })
    if (modo === 'dados' && !empresa.demo_provisionado) {
      return NextResponse.json({ message: 'Gere a estrutura primeiro.' }, { status: 409 })
    }

    const tpl = verticalPorId(empresa.demo_vertical)
    if (!tpl) return NextResponse.json({ message: `Vertical de demo desconhecida: "${empresa.demo_vertical}".` }, { status: 400 })
    const problemas = validarTemplate(tpl)
    if (problemas.length) return NextResponse.json({ message: 'Template inválido.', problemas }, { status: 500 })

    const ctx: Ctx = {
      sb, empresaId, tpl, unidadeId: '', operadorAuthId: '', operadorUsuarioId: '',
      subgrupoIds: new Map(), grupoIds: new Map(), catalogoValores: new Map(), catalogoIds: new Map(),
      perfilCoordenadorId: PERFIL_ADMIN_EMPRESA, perfilGestaoId: PERFIL_ADMIN_EMPRESA,
    }

    // Base comum aos 2 modos (get-or-create idempotente): unidade/grupos/subgrupos + catálogos.
    ctx.unidadeId = await acharUnidade(sb, empresaId, tpl.unidade)
    for (const g of tpl.estrutura) {
      const grupoId = await acharGrupo(sb, ctx.unidadeId, g.grupo)
      ctx.grupoIds.set(g.grupo, grupoId)
      for (const sub of g.subgrupos) ctx.subgrupoIds.set(sub, await acharSubgrupo(sb, grupoId, sub))
    }
    await provisionarCatalogos(ctx)

    if (modo === 'estrutura') {
      // 1ª etapa: perfis, usuários, checklists publicados, causa raiz, tickets, tarefas.
      await provisionarUsuarios(ctx)
      const checklists: ChecklistProvisionado[] = []
      for (const cl of tpl.checklists) checklists.push(await provisionarChecklist(ctx, cl))
      await provisionarCausaRaiz(ctx)
      await provisionarTicketsETarefas(ctx)
      await sb.from('empresas').update({ demo_provisionado: true }).eq('id', empresaId)
      return NextResponse.json({
        ok: true, modo, vertical: tpl.nome,
        criados: { checklists: checklists.length, usuarios: tpl.usuarios.length },
      })
    }

    // 2ª etapa (repetível): só execuções + planos, sobre a estrutura existente.
    await resolverOperador(ctx)
    const checklists: ChecklistProvisionado[] = []
    for (const cl of tpl.checklists) checklists.push(await provisionarChecklist(ctx, cl))
    const { execucoes, planos } = await gerarMassa(ctx, checklists)
    return NextResponse.json({ ok: true, modo, vertical: tpl.nome, criados: { execucoes, planos } })
  } catch (e) {
    return NextResponse.json({ message: 'Erro ao gerar dados de demonstração.', detalhe: (e as Error).message }, { status: 500 })
  }
}
