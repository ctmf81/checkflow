// Lógica pura da exclusão de empresa (usada pela rota
// app/api/empresas/[id]/excluir/route.ts e coberta por testes unitários).

/**
 * Extrai o caminho do arquivo dentro do bucket `empresas` a partir da URL
 * pública do logo (`.../storage/v1/object/public/empresas/<path>?token=...`).
 * Retorna null se a URL não referenciar o bucket. Ignora a query string.
 */
export function extrairLogoPath(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null
  const marker = '/empresas/'
  const idx = logoUrl.indexOf(marker)
  if (idx < 0) return null
  const path = logoUrl.slice(idx + marker.length).split('?')[0].trim()
  return path || null
}

/** Monta os prefixos de storage a remover no bucket `execucoes`. */
export function prefixosExecucoes(ids: {
  execucoes: string[]; tarefaExecucoes: string[]; tickets: string[]; planos: string[]
}): string[] {
  return [
    ...ids.execucoes,
    ...ids.tarefaExecucoes.map(id => `tarefas/${id}`),
    ...ids.tickets.map(id => `tickets/${id}`),
    ...ids.planos.map(id => `planos/${id}`),
  ]
}

/** Monta os prefixos de storage a remover no bucket `empresas`. */
export function prefixosEmpresas(ids: {
  etapas: string[]; documentos: string[]; catalogos: string[]
}): string[] {
  return [
    ...ids.etapas.map(id => `etapas/${id}`),
    ...ids.documentos.map(id => `documentos/${id}`),
    ...ids.catalogos.map(id => `catalogos/${id}`),
  ]
}

/** Paths dos PDFs de checklist (arquivos soltos em pdfs/). */
export function pathsPdfsExecucao(execIds: string[]): string[] {
  return execIds.map(id => `pdfs/${id}.pdf`)
}
