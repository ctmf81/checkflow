import { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'execucoes'

/**
 * Remove todos os arquivos do bucket sob um prefixo (não recursivo —
 * suficiente aqui pois os uploads de execução/plano de ação são
 * sempre arquivos diretos dentro da pasta, sem subpastas).
 */
async function removerPasta(sb: SupabaseClient, prefix: string) {
  const { data: arquivos, error } = await sb.storage.from(BUCKET).list(prefix)
  if (error || !arquivos?.length) return
  const paths = arquivos.map(f => `${prefix}/${f.name}`)
  await sb.storage.from(BUCKET).remove(paths)
}

async function removerArquivo(sb: SupabaseClient, path: string) {
  await sb.storage.from(BUCKET).remove([path])
}

export interface ResultadoLimpeza {
  processadas: number
  erros: { execucaoId: string; erro: string }[]
}

/**
 * Para cada checklist_execucao com data_expiracao no passado e ainda
 * não limpa, remove do Storage as mídias (fotos/vídeos das atividades,
 * PDF do relatório, evidências de planos de ação vinculados) e limpa
 * as referências de URL no banco. O registro da execução, respostas e
 * planos de ação permanecem — só a mídia é removida.
 */
export async function executarLimpezaExecucoes(sb: SupabaseClient): Promise<ResultadoLimpeza> {
  const hoje = new Date().toISOString().slice(0, 10)

  const { data: expiradas, error } = await sb
    .from('checklist_execucoes')
    .select('id, pdf_url')
    .lt('data_expiracao', hoje)
    .is('midia_removida_em', null)

  if (error) throw new Error(`erro ao buscar execuções expiradas: ${error.message}`)

  const resultado: ResultadoLimpeza = { processadas: 0, erros: [] }

  for (const exec of expiradas ?? []) {
    try {
      // fotos/vídeos das atividades: execucoes/{execId}/*
      await removerPasta(sb, exec.id)

      // PDF do relatório: execucoes/pdfs/{execId}.pdf
      if (exec.pdf_url) {
        await removerArquivo(sb, `pdfs/${exec.id}.pdf`)
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
        await removerPasta(sb, `planos/${plano.id}`)

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

      resultado.processadas++
    } catch (e: any) {
      resultado.erros.push({ execucaoId: exec.id, erro: e?.message ?? String(e) })
    }
  }

  return resultado
}
