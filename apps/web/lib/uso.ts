import { createClient } from './supabase'

type OrigemUso = 'execucao' | 'ticket' | 'pdf' | 'tarefa'

/**
 * Registra o consumo de armazenamento de um upload (fotos/vídeos de
 * execuções e tickets, PDFs de relatório) para acompanhamento de uso
 * por empresa em /sistema/empresas/[id].
 *
 * Fire-and-forget: nunca bloqueia nem falha o fluxo principal.
 */
export function registrarUsoArmazenamento(empresaId: string | null | undefined, origem: OrigemUso, tamanhoBytes: number | null | undefined) {
  if (!empresaId || !tamanhoBytes) return
  const supabase = createClient()
  supabase.from('uso_armazenamento').insert({
    empresa_id: empresaId,
    origem,
    tamanho_bytes: tamanhoBytes,
  }).then(({ error }) => {
    if (error) console.error('[uso] erro ao registrar armazenamento:', error.message)
  })
}
