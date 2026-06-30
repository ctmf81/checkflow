import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gerarEstruturaChecklist, TIPOS_CHECKLIST } from '@/lib/ia/checklistIA'

// Gera um checklist da EMPRESA via IA, na unidade do usuário, como RASCUNHO
// para revisão/publicação no montador (3ª opção de criação: além de "usar
// modelo" e "criar do zero"). Reusa o motor de IA da plataforma (lê
// ia_provedores com chave própria — NÃO debita tokens do cliente).
//
// Os INSERTs rodam com o JWT do usuário (não service-role) → o RLS garante
// que ele só cria na sua unidade e somente se tiver a permissão `checklists`.

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: { user } } = await createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE).auth.getUser(token)
  if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 })

  let unidade_id = '', subgrupo_id: string | null = null, descricao = ''
  try {
    const body = await req.json()
    unidade_id = String(body.unidade_id ?? '').trim()
    subgrupo_id = body.subgrupo_id ? String(body.subgrupo_id).trim() : null
    descricao = String(body.descricao ?? '').trim()
  } catch { return Response.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!unidade_id) return Response.json({ error: 'unidade_id é obrigatório' }, { status: 400 })
  if (descricao.length < 15) {
    return Response.json({ error: 'Descreva o checklist com mais detalhes — quanto mais específico, melhor o resultado.' }, { status: 400 })
  }

  const dados = await gerarEstruturaChecklist({ descricao, minSecoes: 2, maxSecoes: 6, contexto: 'checklist' })
  if (!dados?.secoes?.length) {
    return Response.json({ error: 'A IA não conseguiu gerar um checklist. Refine a descrição e tente de novo.' }, { status: 502 })
  }

  // Client com o JWT do usuário → RLS aplica escopo de unidade + permissão.
  const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const nome = String(dados.nome || descricao).slice(0, 120)
  const { data: cl, error: clErr } = await sb.from('checklists').insert({
    unidade_id, subgrupo_id, nome,
    descricao: dados.descricao ? String(dados.descricao).slice(0, 300) : null,
    status: 'rascunho', versao_atual: 0, is_template: false, criado_por: user.id,
  }).select('id').single()
  if (clErr || !cl) {
    const semPermissao = (clErr?.message ?? '').toLowerCase().includes('row-level security')
    return Response.json(
      { error: semPermissao ? 'Você não tem permissão para criar checklists nesta unidade.' : `Erro ao criar checklist: ${clErr?.message ?? ''}` },
      { status: semPermissao ? 403 : 500 },
    )
  }

  // Popula seções/atividades/opções (best-effort: o que entrar fica no rascunho
  // para o usuário revisar/completar no montador).
  const secoes = Array.isArray(dados.secoes) ? dados.secoes.slice(0, 8) : []
  for (let si = 0; si < secoes.length; si++) {
    const sec = secoes[si]
    const { data: secRow } = await sb.from('checklist_secoes')
      .insert({ checklist_id: cl.id, nome: String(sec.nome || `Seção ${si + 1}`).slice(0, 120), ordem: si }).select('id').single()
    if (!secRow) continue
    const atvs = Array.isArray(sec.atividades) ? sec.atividades.slice(0, 20) : []
    for (let ai = 0; ai < atvs.length; ai++) {
      const a = atvs[ai]
      const tipo = TIPOS_CHECKLIST.includes(a?.tipo ?? '') ? a.tipo : 'texto'
      const { data: atvRow } = await sb.from('checklist_atividades').insert({
        checklist_id: cl.id, secao_id: secRow.id, nome: String(a?.nome || 'Atividade').slice(0, 200),
        tipo, ordem: ai, obrigatoria: a?.obrigatoria !== false, critica: !!a?.critica,
        gera_plano_acao: !!a?.gera_plano_acao, config: (a?.config && typeof a.config === 'object') ? a.config : {},
      }).select('id').single()
      if (atvRow && tipo === 'multipla_escolha' && Array.isArray(a?.opcoes)) {
        const ops = a.opcoes.slice(0, 12).map((o: any, oi: number) => ({
          atividade_id: atvRow.id, label: String(o?.label || o?.valor || `Opção ${oi + 1}`).slice(0, 120),
          valor: String(o?.valor || o?.label || `op${oi + 1}`).slice(0, 120), ordem: oi, e_valido: o?.e_valido !== false,
        }))
        if (ops.length) await sb.from('checklist_atividade_opcoes').insert(ops)
      }
    }
  }

  return Response.json({ ok: true, id: cl.id })
}
