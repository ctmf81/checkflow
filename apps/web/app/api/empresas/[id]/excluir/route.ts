import { NextRequest } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { extrairLogoPath, prefixosExecucoes, prefixosEmpresas, pathsPdfsExecucao } from '@/lib/empresaExclusao'

// Exclui DEFINITIVAMENTE uma empresa já inativa (admin de sistema): apaga os
// ARQUIVOS do storage (que o cascade do banco NÃO remove) e depois deleta a
// empresa (FKs `on delete cascade` levam o resto). Storage não é namespaced por
// empresa → enumeramos os IDs (via unidade→empresa) e removemos por prefixo.
// Best-effort no storage: uma falha de arquivo não aborta a exclusão do banco.

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

function erro(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}

// Lista os objetos sob um prefixo (pasta) e, se não for dry-run, remove.
// Retorna nº de arquivos encontrados (= removidos, exceto no dry-run).
async function removerPrefixo(sb: SupabaseClient, bucket: string, prefix: string, dry: boolean): Promise<number> {
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error || !data?.length) return 0
  const paths = data.filter(o => o.name).map(o => `${prefix}/${o.name}`)
  if (!paths.length) return 0
  if (!dry) await sb.storage.from(bucket).remove(paths)
  return paths.length
}

async function removerPrefixos(sb: SupabaseClient, bucket: string, prefixos: string[], dry: boolean): Promise<number> {
  let total = 0
  for (const p of prefixos) {
    try { total += await removerPrefixo(sb, bucket, p, dry) } catch { /* best-effort */ }
  }
  return total
}

const idsDe = (r: { data: any[] | null }) => (r.data ?? []).map((x: any) => x.id as string)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!SUPABASE_SECRET) return erro('Indisponível', 500)
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return erro('Não autenticado', 401)
  const { id: empresaId } = await params

  // Autoriza: só admin de sistema
  const ehChave = (k: string) => !!k && !k.startsWith('http')
  const keyPublica = [SUPABASE_PUBLISHABLE, SUPABASE_SECRET].find(ehChave) ?? ''
  const { data: { user } } = await createClient(SUPABASE_URL, keyPublica).auth.getUser(token)
  if (!user) return erro('Sessão inválida', 401)
  if (user.app_metadata?.role !== 'admin_sistema') return erro('Apenas o administrador do sistema pode excluir empresas.', 403)

  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET)

  const { data: empresa } = await sb.from('empresas').select('id, status, logo_url').eq('id', empresaId).maybeSingle()
  if (!empresa) return erro('Empresa não encontrada', 404)
  if (empresa.status !== 'inativo') return erro('A empresa precisa estar inativa antes de excluir.', 409)

  // Dry-run (?dryRun=1): só enumera e devolve o que SERIA apagado — não remove
  // nada do storage nem roda o cascade. Serve p/ conferir o raio de explosão.
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  let removidos = 0
  const linhas: Record<string, number> = {}

  // Unidades da empresa → enumera os IDs de cada fonte de arquivo
  const { data: unidades } = await sb.from('unidades').select('id').eq('empresa_id', empresaId)
  const unidadeIds = (unidades ?? []).map((u: any) => u.id as string)
  linhas.unidades = unidadeIds.length

  if (unidadeIds.length) {
    const [execs, tickets, planos, docs, catalogos, listas] = await Promise.all([
      sb.from('checklist_execucoes').select('id').in('unidade_id', unidadeIds),
      sb.from('tickets').select('id').in('unidade_id', unidadeIds),
      sb.from('planos_acao').select('id').in('unidade_id', unidadeIds),
      sb.from('documentos').select('id').in('unidade_id', unidadeIds),
      sb.from('catalogos').select('id').in('unidade_id', unidadeIds),
      sb.from('tarefa_listas').select('id').in('unidade_id', unidadeIds),
    ])

    const docIds = idsDe(docs)
    const listaIds = idsDe(listas)
    const [etapas, tarefaExecs] = await Promise.all([
      docIds.length ? sb.from('documento_etapas').select('id').in('documento_id', docIds) : Promise.resolve({ data: [] }),
      listaIds.length ? sb.from('tarefa_execucoes').select('id').in('lista_id', listaIds) : Promise.resolve({ data: [] }),
    ])

    const execIds = idsDe(execs)
    Object.assign(linhas, {
      checklist_execucoes: execIds.length,
      tickets: idsDe(tickets).length,
      planos_acao: idsDe(planos).length,
      documentos: docIds.length,
      catalogos: idsDe(catalogos).length,
      tarefa_listas: listaIds.length,
      documento_etapas: idsDe(etapas).length,
      tarefa_execucoes: idsDe(tarefaExecs).length,
    })

    // Bucket execucoes: {execId}/, tarefas/{tarefaExecId}/, tickets/{ticketId}/, planos/{planoId}/
    removidos += await removerPrefixos(sb, 'execucoes', prefixosExecucoes({
      execucoes: execIds, tarefaExecucoes: idsDe(tarefaExecs), tickets: idsDe(tickets), planos: idsDe(planos),
    }), dryRun)

    // PDFs de checklist são arquivos soltos em pdfs/{execId}.pdf (não um prefixo).
    const pdfPaths = pathsPdfsExecucao(execIds)
    if (pdfPaths.length) {
      if (dryRun) {
        try {
          const { data } = await sb.storage.from('execucoes').list('pdfs', { limit: 1000 })
          const alvo = new Set(execIds.map(id => `${id}.pdf`))
          removidos += (data ?? []).filter(o => alvo.has(o.name)).length
        } catch { /* best-effort */ }
      } else {
        try {
          const { data } = await sb.storage.from('execucoes').remove(pdfPaths)
          removidos += data?.length ?? 0
        } catch { /* best-effort */ }
      }
    }

    // Bucket empresas: etapas/{etapaId}/, documentos/{docId}/, catalogos/{catId}/
    removidos += await removerPrefixos(sb, 'empresas', prefixosEmpresas({
      etapas: idsDe(etapas), documentos: docIds, catalogos: idsDe(catalogos),
    }), dryRun)
  }

  // Logo da empresa (path extraído da URL pública: .../empresas/<path>)
  const logoPath = extrairLogoPath(empresa.logo_url as string | null)
  if (logoPath) {
    if (dryRun) removidos++
    else try { await sb.storage.from('empresas').remove([logoPath]); removidos++ } catch { /* best-effort */ }
  }

  if (dryRun) {
    return new Response(JSON.stringify({
      dry_run: true, empresa_id: empresaId, arquivos_a_remover: removidos, logo_path: logoPath, linhas,
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // Deleta a empresa reusando a RPC testada `excluir_empresa_cascata` (guarda
  // is_admin_sistema + status='inativo'; FKs on delete cascade levam o resto do
  // banco). Chamada com o JWT do admin (a RPC precisa de auth.uid — service role
  // não passaria no is_admin_sistema).
  const adminSb = createClient(SUPABASE_URL, keyPublica, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { error: delErr } = await adminSb.rpc('excluir_empresa_cascata', { p_empresa_id: empresaId })
  if (delErr) return erro(`Erro ao excluir a empresa do banco: ${delErr.message}`, 500)

  return new Response(JSON.stringify({ ok: true, arquivos_removidos: removidos }), { headers: { 'Content-Type': 'application/json' } })
}
