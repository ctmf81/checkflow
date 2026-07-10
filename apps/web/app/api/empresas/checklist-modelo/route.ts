import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Cria o checklist MODELO fixo de uma empresa nova (setup automático), JÁ
// PUBLICADO e escopado à unidade/subgrupo padrão. Determinístico (sem IA):
// "Checagem de início de trabalho" — 2 seções × 4 atividades, cobrindo os tipos
// que não dependem de cadastro prévio. Restrito ao admin de sistema.

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Estrutura fixa do modelo. Um tipo de atividade em cada, 4 por seção.
const MODELO = {
  nome: 'Checagem de início de trabalho',
  descricao: 'Verificação de equipamentos e do local antes de iniciar o trabalho.',
  secoes: [
    {
      nome: 'Equipamentos',
      atividades: [
        { nome: 'Os EPIs necessários estão disponíveis e em bom estado?', tipo: 'sim_nao', obrigatoria: true, critica: true, gera_plano_acao: true, config: { esperado: 'sim' } },
        { nome: 'Condição geral dos equipamentos', tipo: 'multipla_escolha', obrigatoria: true, config: {}, opcoes: [
          { label: 'Ótimo', valor: 'otimo', e_valido: true },
          { label: 'Bom', valor: 'bom', e_valido: true },
          { label: 'Regular', valor: 'regular', e_valido: true },
          { label: 'Ruim', valor: 'ruim', e_valido: false },
        ] },
        { nome: 'Quantidade de equipamentos verificados', tipo: 'numero', obrigatoria: true, config: { min: 0, unidade: 'un' } },
        { nome: 'Foto dos equipamentos antes do início', tipo: 'foto', obrigatoria: false, config: {} },
      ],
    },
    {
      nome: 'Local de trabalho',
      atividades: [
        { nome: 'A área de trabalho está limpa e livre de obstruções?', tipo: 'sim_nao', obrigatoria: true, critica: true, gera_plano_acao: true, config: { esperado: 'sim' } },
        { nome: 'Observações sobre as condições do local', tipo: 'texto', obrigatoria: false, config: {} },
        { nome: 'Data e hora da checagem', tipo: 'data_hora', obrigatoria: true, config: {} },
        { nome: 'Foto do local de trabalho', tipo: 'foto', obrigatoria: false, config: {} },
      ],
    },
  ],
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })
  const ehChave = (key: string) => !!key && !key.startsWith('http')
  const keyUsada = [SUPABASE_SECRET, SUPABASE_PUBLISHABLE].find(ehChave) ?? ''
  const { data: { user } } = await createClient(SUPABASE_URL, keyUsada).auth.getUser(token)
  if (!user || user.user_metadata?.role !== 'admin_sistema') {
    return Response.json({ error: 'Acesso restrito ao administrador do sistema.' }, { status: 403 })
  }

  let unidade_id = '', subgrupo_id = ''
  try {
    const body = await req.json()
    unidade_id = String(body.unidade_id ?? '').trim()
    subgrupo_id = String(body.subgrupo_id ?? '').trim()
  } catch { return Response.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!unidade_id || !subgrupo_id) return Response.json({ error: 'unidade_id e subgrupo_id são obrigatórios' }, { status: 400 })

  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET)

  // Rascunho → popula → publica (mesmo contrato do montador / checklist-inicial).
  const { data: cl, error: clErr } = await admin.from('checklists').insert({
    unidade_id, subgrupo_id, nome: MODELO.nome, descricao: MODELO.descricao,
    status: 'rascunho', versao_atual: 0, is_template: false, criado_por: user.id,
  }).select('id').single()
  if (clErr || !cl) return Response.json({ error: `Erro ao criar checklist: ${clErr?.message ?? ''}` }, { status: 500 })

  const secoesSnapshot: any[] = []
  for (let si = 0; si < MODELO.secoes.length; si++) {
    const sec = MODELO.secoes[si]
    const { data: secRow } = await admin.from('checklist_secoes')
      .insert({ checklist_id: cl.id, nome: sec.nome, ordem: si }).select('id').single()
    if (!secRow) continue
    const atvsSnapshot: any[] = []
    for (let ai = 0; ai < sec.atividades.length; ai++) {
      const a: any = sec.atividades[ai]
      const { data: atvRow } = await admin.from('checklist_atividades').insert({
        checklist_id: cl.id, secao_id: secRow.id, nome: a.nome, tipo: a.tipo, ordem: ai,
        obrigatoria: a.obrigatoria !== false, critica: !!a.critica,
        gera_plano_acao: !!a.gera_plano_acao, config: a.config ?? {},
      }).select('id').single()
      if (!atvRow) continue
      if (a.tipo === 'multipla_escolha' && Array.isArray(a.opcoes)) {
        const ops = a.opcoes.map((o: any, oi: number) => ({
          atividade_id: atvRow.id, label: o.label, valor: o.valor, ordem: oi, e_valido: o.e_valido !== false,
        }))
        if (ops.length) await admin.from('checklist_atividade_opcoes').insert(ops)
      }
      atvsSnapshot.push({ id: atvRow.id, nome: a.nome, tipo: a.tipo, obrigatoria: a.obrigatoria !== false, critica: !!a.critica, gera_plano_acao: !!a.gera_plano_acao, config: a.config ?? {} })
    }
    secoesSnapshot.push({ id: secRow.id, nome: sec.nome, ordem: si, atividades: atvsSnapshot })
  }

  if (secoesSnapshot.length === 0) return Response.json({ ok: true, id: cl.id, publicado: false })

  await admin.from('checklist_versoes').insert({
    checklist_id: cl.id, numero_versao: 1,
    snapshot: { nome: MODELO.nome, descricao: MODELO.descricao, subgrupo_id, secoes: secoesSnapshot },
    publicado_por: user.id,
  })
  await admin.from('checklists').update({
    status: 'publicado', versao_atual: 1, atualizado_em: new Date().toISOString(),
  }).eq('id', cl.id)

  return Response.json({ ok: true, id: cl.id, publicado: true })
}
