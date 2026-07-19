import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gerarEstruturaChecklist, TIPOS_CHECKLIST } from '@/lib/ia/checklistIA'

// Gera um TEMPLATE de checklist com IA (admin de sistema). A IA devolve JSON
// estruturado; criamos o template como RASCUNHO para o admin revisar/publicar no
// montador. O motor de IA (failover de provedores) vive em lib/ia/checklistIA.

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })
  const ehChave = (k: string) => !!k && !k.startsWith('http')
  const keyUsada = [SUPABASE_SECRET, SUPABASE_PUBLISHABLE].find(ehChave) ?? ''
  const { data: { user } } = await createClient(SUPABASE_URL, keyUsada).auth.getUser(token)
  if (!user || user.app_metadata?.role !== 'admin_sistema') return Response.json({ error: 'Acesso restrito ao administrador do sistema.' }, { status: 403 })

  let descricao = '', segmentos: string[] = []
  try {
    const body = await req.json()
    descricao = (body.descricao ?? '').toString().trim()
    segmentos = Array.isArray(body.segmentos) ? body.segmentos.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean) : []
  } catch { return Response.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!descricao) return Response.json({ error: 'Descreva o checklist que deseja gerar.' }, { status: 400 })

  const dados = await gerarEstruturaChecklist({ descricao, segmentos, minSecoes: 2, maxSecoes: 6, contexto: 'template' })
  if (!dados?.secoes?.length) return Response.json({ error: 'A IA não retornou um checklist válido. Tente refinar a descrição.' }, { status: 502 })

  // ── Cria o template (rascunho) ──
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET)
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
      const tipo = TIPOS_CHECKLIST.includes(a?.tipo ?? '') ? a.tipo : 'texto'
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
