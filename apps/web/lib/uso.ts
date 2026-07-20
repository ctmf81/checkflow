import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from './supabase'

type OrigemUso = 'execucao' | 'ticket' | 'pdf' | 'tarefa' | 'documento'

/** Mensagem única de bloqueio por capacidade de armazenamento do plano. */
export const MSG_ARMAZENAMENTO_CHEIO =
  'Capacidade de armazenamento do plano atingida. Contate o administrador para ampliar o plano ou comprar mais espaço.'

/**
 * True se ainda cabe `tamanhoBytes` no plano da empresa; false só quando a RPC
 * responde explicitamente que estourou. Chame ANTES do upload (freio de cota).
 *
 * Fail-open de propósito: sem empresa/sem bytes, ou erro na RPC → libera (não
 * trava o fluxo do operador por indisponibilidade da checagem). O consumo
 * segue sendo contabilizado por `registrarUsoArmazenamento`.
 */
export async function armazenamentoDisponivel(
  supabase: SupabaseClient,
  empresaId: string | null | undefined,
  tamanhoBytes: number | null | undefined,
): Promise<boolean> {
  if (!empresaId || !tamanhoBytes) return true
  const { data, error } = await supabase.rpc('billing_armazenamento_disponivel', {
    p_empresa_id: empresaId,
    p_bytes: tamanhoBytes,
  })
  if (error) {
    console.error('[uso] erro ao checar armazenamento:', error.message)
    return true
  }
  return data !== false
}

/** Soma o tamanho de um lote de arquivos/blobs para a checagem única de cota. */
export function somaBytes(itens: Array<{ size: number } | null | undefined>): number {
  return itens.reduce((total, it) => total + (it?.size ?? 0), 0)
}

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
