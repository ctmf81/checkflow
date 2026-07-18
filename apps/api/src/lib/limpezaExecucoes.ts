import { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'execucoes'

/**
 * Remove todos os arquivos do bucket sob um prefixo (não recursivo —
 * suficiente aqui pois os uploads de execução/plano de ação são
 * sempre arquivos diretos dentro da pasta, sem subpastas).
 * Retorna o total de bytes removidos (para abater do uso de armazenamento).
 */
async function removerPasta(sb: SupabaseClient, prefix: string): Promise<number> {
  const { data: arquivos, error } = await sb.storage.from(BUCKET).list(prefix)
  if (error || !arquivos?.length) return 0
  const bytes = arquivos.reduce((acc, f) => acc + (f.metadata?.size ?? 0), 0)
  const paths = arquivos.map(f => `${prefix}/${f.name}`)
  await sb.storage.from(BUCKET).remove(paths)
  return bytes
}

/** Remove um arquivo específico, retornando o tamanho em bytes removido. */
async function removerArquivo(sb: SupabaseClient, folder: string, nome: string): Promise<number> {
  const { data: arquivos } = await sb.storage.from(BUCKET).list(folder, { search: nome })
  const alvo = arquivos?.find(f => f.name === nome)
  const bytes = alvo?.metadata?.size ?? 0
  await sb.storage.from(BUCKET).remove([`${folder}/${nome}`])
  return bytes
}

export interface ResultadoLimpeza {
  processadas: number
  bytes_removidos: number
  erros: { execucaoId: string; erro: string }[]
}

/**
 * Para cada checklist_execucao com data_expiracao no passado e ainda
 * não limpa, remove do Storage as mídias (fotos/vídeos das atividades,
 * PDF do relatório, evidências de planos de ação vinculados) e limpa
 * as referências de URL no banco. O registro da execução, respostas e
 * planos de ação permanecem — só a mídia é removida.
 *
 * Os bytes removidos são registrados como entrada NEGATIVA em
 * `uso_armazenamento`, para que o uso reflita sempre a ocupação real
 * (a capacidade é fixa; o tempo de guarda é a alavanca de espaço).
 */
export async function executarLimpezaExecucoes(sb: SupabaseClient): Promise<ResultadoLimpeza> {
  const hoje = new Date().toISOString().slice(0, 10)

  const { data: expiradas, error } = await sb
    .from('checklist_execucoes')
    .select('id, pdf_url, unidade_id')
    .lt('data_expiracao', hoje)
    .is('midia_removida_em', null)

  if (error) throw new Error(`erro ao buscar execuções expiradas: ${error.message}`)

  const resultado: ResultadoLimpeza = { processadas: 0, bytes_removidos: 0, erros: [] }

  // Cache unidade_id -> empresa_id para registrar o abatimento por empresa
  const empresaPorUnidade = new Map<string, string | null>()
  async function empresaDaUnidade(unidadeId: string | null): Promise<string | null> {
    if (!unidadeId) return null
    if (empresaPorUnidade.has(unidadeId)) return empresaPorUnidade.get(unidadeId)!
    const { data } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
    const empresaId = data?.empresa_id ?? null
    empresaPorUnidade.set(unidadeId, empresaId)
    return empresaId
  }

  for (const exec of expiradas ?? []) {
    try {
      let bytes = 0

      // fotos/vídeos das atividades: execucoes/{execId}/*
      bytes += await removerPasta(sb, exec.id)

      // PDF do relatório: execucoes/pdfs/{execId}.pdf
      if (exec.pdf_url) {
        bytes += await removerArquivo(sb, 'pdfs', `${exec.id}.pdf`)
      }

      // limpa URLs das respostas (mantém o restante do jsonb)
      const { data: respostas } = await sb
        .from('checklist_execucao_respostas')
        .select('id, resposta')
        .eq('execucao_id', exec.id)

      for (const r of respostas ?? []) {
        if (r.resposta && typeof r.resposta === 'object' && 'url' in r.resposta) {
          const { url, ...resto } = r.resposta as Record<string, unknown>
          await sb.from('checklist_execucao_respostas')
            .update({ resposta: { ...resto, midia_removida: true } })
            .eq('id', r.id)
        }
      }

      // planos de ação vinculados: evidências em execucoes/planos/{planoId}/*
      const { data: planos } = await sb
        .from('planos_acao')
        .select('id')
        .eq('checklist_execucao_id', exec.id)

      for (const plano of planos ?? []) {
        bytes += await removerPasta(sb, `planos/${plano.id}`)

        const { data: movs } = await sb
          .from('plano_acao_movimentacoes')
          .select('id')
          .eq('plano_acao_id', plano.id)
        const movIds = (movs ?? []).map(m => m.id)

        await sb.from('plano_acao_evidencias').delete().eq('plano_acao_id', plano.id)
        if (movIds.length) {
          await sb.from('plano_acao_movimentacao_evidencias').delete().in('movimentacao_id', movIds)
        }
      }

      // remove referência do PDF e marca como limpa
      await sb.from('checklist_execucoes')
        .update({ pdf_url: null, midia_removida_em: new Date().toISOString() })
        .eq('id', exec.id)

      // abate os bytes removidos do uso de armazenamento da empresa
      if (bytes > 0) {
        const empresaId = await empresaDaUnidade(exec.unidade_id)
        if (empresaId) {
          await sb.from('uso_armazenamento').insert({
            empresa_id: empresaId,
            origem: 'execucao',
            tamanho_bytes: -bytes,
          })
        }
      }

      resultado.bytes_removidos += bytes
      resultado.processadas++
    } catch (e: any) {
      resultado.erros.push({ execucaoId: exec.id, erro: e?.message ?? String(e) })
    }
  }

  return resultado
}

// ─── Limpeza por PRAZO FIXO (3 meses) — tickets e tarefas ─────────────────────
// Diferente da execução (que segue o tempo de guarda do checklist), a mídia de
// ticket e de tarefa é removida 3 meses após a criação. Só a mídia sai — os
// registros permanecem. Bytes abatidos do uso de armazenamento (billing).

const TRES_MESES_MS = 90 * 24 * 60 * 60 * 1000

export interface ResLimpeza {
  processadas: number
  bytes_removidos: number
  erros: { id: string; erro: string }[]
}

async function empresaDaUnidade(sb: SupabaseClient, cache: Map<string, string | null>, unidadeId: string | null): Promise<string | null> {
  if (!unidadeId) return null
  if (cache.has(unidadeId)) return cache.get(unidadeId)!
  const { data } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
  const empresaId = data?.empresa_id ?? null
  cache.set(unidadeId, empresaId)
  return empresaId
}

async function abater(sb: SupabaseClient, cache: Map<string, string | null>, unidadeId: string | null, origem: string, bytes: number): Promise<void> {
  if (bytes <= 0) return
  const empresaId = await empresaDaUnidade(sb, cache, unidadeId)
  if (empresaId) {
    await sb.from('uso_armazenamento').insert({ empresa_id: empresaId, origem, tamanho_bytes: -bytes })
  }
}

/** Remove a mídia de tickets criados há mais de 3 meses (evidências em execucoes/tickets/{id}/*). */
export async function executarLimpezaTickets(sb: SupabaseClient): Promise<ResLimpeza> {
  const cutoff = new Date(Date.now() - TRES_MESES_MS).toISOString()
  const cache = new Map<string, string | null>()
  const resultado: ResLimpeza = { processadas: 0, bytes_removidos: 0, erros: [] }

  const { data: evids } = await sb.from('ticket_evidencias')
    .select('ticket_id, tickets!inner(criado_em, unidade_id)')
    .lt('tickets.criado_em', cutoff)

  const porTicket = new Map<string, string | null>()
  for (const e of (evids ?? [])) porTicket.set(e.ticket_id, (e.tickets as any)?.unidade_id ?? null)

  for (const [ticketId, unidadeId] of porTicket) {
    try {
      const bytes = await removerPasta(sb, `tickets/${ticketId}`)
      await sb.from('ticket_evidencias').delete().eq('ticket_id', ticketId)
      await abater(sb, cache, unidadeId, 'ticket', bytes)
      resultado.bytes_removidos += bytes
      resultado.processadas++
    } catch (e: any) {
      resultado.erros.push({ id: ticketId, erro: e?.message ?? String(e) })
    }
  }
  return resultado
}

// ─── Varredura de ÓRFÃOS ──────────────────────────────────────────────────────
// Arquivos no bucket cujo "pai" (execução/pdf/tarefa/ticket/plano) não existe
// mais no banco — ex.: entidade deletada sem limpar a mídia, ou upload que subiu
// mas o insert falhou. Só apaga o que tem pai COMPROVADAMENTE ausente E cujo
// arquivo mais novo tem mais de 7 dias (janela de segurança contra upload em
// andamento / linha ainda não gravada). Não abate billing (o pai já não existe
// para mapear empresa; órfãos são casos de borda).

const PREFIXOS_CONHECIDOS = new Set(['pdfs', 'tarefas', 'tickets', 'planos'])
const JANELA_SEGURANCA_MS = 7 * 24 * 60 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function pedacos<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/** IDs (dentre os fornecidos) que ainda existem em `tabela`. */
async function idsExistentes(sb: SupabaseClient, tabela: string, ids: string[]): Promise<Set<string>> {
  const existem = new Set<string>()
  for (const bloco of pedacos(ids, 300)) {
    const { data } = await sb.from(tabela).select('id').in('id', bloco)
    for (const r of (data ?? [])) existem.add(r.id as string)
  }
  return existem
}

/** Lista TODAS as entradas de um prefixo (paginado). */
async function listarTudo(sb: SupabaseClient, prefix: string): Promise<{ name: string; createdMs: number; size: number | null }[]> {
  const todos: any[] = []
  let offset = 0
  const limite = 1000
  for (;;) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: limite, offset })
    if (error || !data?.length) break
    todos.push(...data)
    if (data.length < limite) break
    offset += limite
  }
  // metadata nulo = pasta; com size = arquivo.
  return todos.map(e => ({ name: e.name, createdMs: e.created_at ? Date.parse(e.created_at) : 0, size: e.metadata?.size ?? null }))
}

/** Remove uma pasta órfã só se o arquivo mais novo for antigo. Retorna true se removeu. */
async function removerPastaOrfaSeAntiga(sb: SupabaseClient, prefix: string): Promise<boolean> {
  const arquivos = await listarTudo(sb, prefix)
  if (!arquivos.length) return false
  const maisNovo = Math.max(...arquivos.map(a => a.createdMs))
  if (Date.now() - maisNovo < JANELA_SEGURANCA_MS) return false // recente → não mexe
  await sb.storage.from(BUCKET).remove(arquivos.map(a => `${prefix}/${a.name}`))
  return true
}

/** Subpastas {id}/ de um prefixo-raiz cujo id não existe mais na tabela. */
async function limparSubpastasOrfas(sb: SupabaseClient, prefixoRaiz: string, tabela: string, erros: string[]): Promise<number> {
  const subs = (await listarTudo(sb, prefixoRaiz)).filter(e => e.size == null && UUID_RE.test(e.name)).map(e => e.name)
  if (!subs.length) return 0
  const existem = await idsExistentes(sb, tabela, subs)
  let removidas = 0
  for (const id of subs) {
    if (existem.has(id)) continue
    try { if (await removerPastaOrfaSeAntiga(sb, `${prefixoRaiz}/${id}`)) removidas++ } catch (e: any) { erros.push(`${prefixoRaiz} ${id}: ${e?.message}`) }
  }
  return removidas
}

export interface ResOrfaos {
  execucoes: number; pdfs: number; tarefas: number; tickets: number; planos: number
  erros: string[]
}

export async function executarLimpezaOrfaos(sb: SupabaseClient): Promise<ResOrfaos> {
  const res: ResOrfaos = { execucoes: 0, pdfs: 0, tarefas: 0, tickets: 0, planos: 0, erros: [] }
  try {
    // 1) Pastas {execId}/ na raiz sem checklist_execucoes
    const raiz = await listarTudo(sb, '')
    const execFolders = raiz.filter(e => e.size == null && !PREFIXOS_CONHECIDOS.has(e.name) && UUID_RE.test(e.name)).map(e => e.name)
    if (execFolders.length) {
      const existem = await idsExistentes(sb, 'checklist_execucoes', execFolders)
      for (const id of execFolders) {
        if (existem.has(id)) continue
        try { if (await removerPastaOrfaSeAntiga(sb, id)) res.execucoes++ } catch (e: any) { res.erros.push(`exec ${id}: ${e?.message}`) }
      }
    }

    // 2) pdfs/{execId}.pdf sem checklist_execucoes (arquivos soltos, com data própria)
    const pdfs = (await listarTudo(sb, 'pdfs')).filter(p => p.size != null && /\.pdf$/i.test(p.name))
    const pdfIds = pdfs.map(p => p.name.replace(/\.pdf$/i, '')).filter(id => UUID_RE.test(id))
    if (pdfIds.length) {
      const existem = await idsExistentes(sb, 'checklist_execucoes', pdfIds)
      const orfaos = pdfs.filter(p => {
        const id = p.name.replace(/\.pdf$/i, '')
        const antigo = Date.now() - p.createdMs >= JANELA_SEGURANCA_MS
        return UUID_RE.test(id) && !existem.has(id) && antigo
      })
      if (orfaos.length) {
        await sb.storage.from(BUCKET).remove(orfaos.map(p => `pdfs/${p.name}`))
        res.pdfs = orfaos.length
      }
    }

    // 3-5) subpastas de tarefas/ tickets/ planos/
    res.tarefas = await limparSubpastasOrfas(sb, 'tarefas', 'tarefa_execucoes', res.erros)
    res.tickets = await limparSubpastasOrfas(sb, 'tickets', 'tickets', res.erros)
    res.planos = await limparSubpastasOrfas(sb, 'planos', 'planos_acao', res.erros)
  } catch (e: any) {
    res.erros.push(`geral: ${e?.message ?? String(e)}`)
  }
  return res
}

/** Remove a mídia de tarefas cuja execução foi aberta há mais de 3 meses (execucoes/tarefas/{execId}/*). */
export async function executarLimpezaTarefas(sb: SupabaseClient): Promise<ResLimpeza> {
  const cutoff = new Date(Date.now() - TRES_MESES_MS).toISOString()
  const cache = new Map<string, string | null>()
  const resultado: ResLimpeza = { processadas: 0, bytes_removidos: 0, erros: [] }

  const { data: resp } = await sb.from('tarefa_respostas')
    .select('execucao_id, tarefa_execucoes!inner(aberta_em, unidade_id)')
    .not('evidencia_url', 'is', null)
    .lt('tarefa_execucoes.aberta_em', cutoff)

  const porExec = new Map<string, string | null>()
  for (const r of (resp ?? [])) porExec.set(r.execucao_id, (r.tarefa_execucoes as any)?.unidade_id ?? null)

  for (const [execId, unidadeId] of porExec) {
    try {
      const bytes = await removerPasta(sb, `tarefas/${execId}`)
      await sb.from('tarefa_respostas')
        .update({ evidencia_url: null, evidencia_tipo: null })
        .eq('execucao_id', execId).not('evidencia_url', 'is', null)
      await abater(sb, cache, unidadeId, 'tarefa', bytes)
      resultado.bytes_removidos += bytes
      resultado.processadas++
    } catch (e: any) {
      resultado.erros.push({ id: execId, erro: e?.message ?? String(e) })
    }
  }
  return resultado
}
