import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gerarEstruturaChecklist, TIPOS_CHECKLIST } from '@/lib/ia/checklistIA'

// Gera o checklist INICIAL de uma empresa nova (setup automático) via IA e o
// insere JÁ PUBLICADO, escopado à unidade/subgrupo padrão criados no cadastro —
// pronto para o admin executar no primeiro acesso. Exatamente 2 seções, só
// tipos que não dependem de cadastro prévio. Restrito ao admin de sistema.

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })
  const ehChave = (key: string) => !!key && !key.startsWith('http')
  const keyUsada = [SUPABASE_SECRET, SUPABASE_PUBLISHABLE].find(ehChave) ?? ''
  const { data: { user } } = await createClient(SUPABASE_URL, keyUsada).auth.getUser(token)
  if (!user || user.user_metadata?.role !== 'admin_sistema') {
    return Response.json({ error: 'Acesso restrito ao administrador do sistema.' }, { status: 403 })
  }

  let unidade_id = '', subgrupo_id = '', descricao = ''
  try {
    const body = await req.json()
    unidade_id = String(body.unidade_id ?? '').trim()
    subgrupo_id = String(body.subgrupo_id ?? '').trim()
    descricao = String(body.descricao ?? '').trim()
  } catch { return Response.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!unidade_id || !subgrupo_id) return Response.json({ error: 'unidade_id e subgrupo_id são obrigatórios' }, { status: 400 })
  if (!descricao) return Response.json({ error: 'Descreva o checklist que deseja gerar.' }, { status: 400 })

  const dados = await gerarEstruturaChecklist({ descricao, minSecoes: 2, maxSecoes: 2 })
  if (!dados?.secoes?.length) {
    return Response.json({ error: 'A IA não retornou um checklist válido. Tente refinar a descrição.' }, { status: 502 })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET)

  // ── Checklist JÁ PUBLICADO, escopado à unidade/subgrupo ──
  const nome = String(dados.nome || descricao).slice(0, 120)
  const { data: cl, error: clErr } = await admin.from('checklists').insert({
    unidade_id, subgrupo_id, nome,
    descricao: dados.descricao ? String(dados.descricao).slice(0, 300) : null,
    status: 'publicado', versao_atual: 1, is_template: false, criado_por: user.id,
  }).select('id').single()
  if (clErr || !cl) return Response.json({ error: `Erro ao criar checklist: ${clErr?.message ?? ''}` }, { status: 500 })

  // Normalizado (o que a Operação executa) + snapshot de versão (histórico).
  const secoes = Array.isArray(dados.secoes) ? dados.secoes.slice(0, 2) : []
  const secoesSnapshot: any[] = []
  for (let si = 0; si < secoes.length; si++) {
    const sec = secoes[si]
    const secNome = String(sec.nome || `Seção ${si + 1}`).slice(0, 120)
    const { data: secRow } = await admin.from('checklist_secoes')
      .insert({ checklist_id: cl.id, nome: secNome, ordem: si }).select('id').single()
    if (!secRow) continue
    const atvsSnapshot: any[] = []
    const atvs = Array.isArray(sec.atividades) ? sec.atividades.slice(0, 20) : []
    for (let ai = 0; ai < atvs.length; ai++) {
      const a = atvs[ai]
      const tipo = TIPOS_CHECKLIST.includes(a?.tipo ?? '') ? a.tipo : 'texto'
      const config = (a?.config && typeof a.config === 'object') ? a.config : {}
      const { data: atvRow } = await admin.from('checklist_atividades').insert({
        checklist_id: cl.id, secao_id: secRow.id, nome: String(a?.nome || 'Atividade').slice(0, 200),
        tipo, ordem: ai, obrigatoria: a?.obrigatoria !== false, critica: !!a?.critica,
        gera_plano_acao: !!a?.gera_plano_acao, config,
      }).select('id').single()
      if (!atvRow) continue
      if (tipo === 'multipla_escolha' && Array.isArray(a?.opcoes)) {
        const ops = a.opcoes.slice(0, 12).map((o: any, oi: number) => ({
          atividade_id: atvRow.id, label: String(o?.label || o?.valor || `Opção ${oi + 1}`).slice(0, 120),
          valor: String(o?.valor || o?.label || `op${oi + 1}`).slice(0, 120), ordem: oi, e_valido: o?.e_valido !== false,
        }))
        if (ops.length) await admin.from('checklist_atividade_opcoes').insert(ops)
      }
      atvsSnapshot.push({ id: atvRow.id, nome: a?.nome, tipo, obrigatoria: a?.obrigatoria !== false, critica: !!a?.critica, gera_plano_acao: !!a?.gera_plano_acao, config })
    }
    secoesSnapshot.push({ id: secRow.id, nome: secNome, ordem: si, atividades: atvsSnapshot })
  }

  // Snapshot v1 (mesmo contrato do "publicar" do montador).
  await admin.from('checklist_versoes').insert({
    checklist_id: cl.id, numero_versao: 1,
    snapshot: { nome, descricao: dados.descricao ?? null, subgrupo_id, secoes: secoesSnapshot },
    publicado_por: user.id,
  })

  return Response.json({ ok: true, id: cl.id })
}
