/**
 * Busca e renderiza templates de notificação do banco por empresa.
 * Se não encontrar template da empresa, retorna null (caller usa fallback hardcoded).
 */

import { SupabaseClient } from '@supabase/supabase-js'

export type NotificacaoTipo =
  | 'ticket_aberto'
  | 'ticket_movimentado'
  | 'plano_aberto'
  | 'plano_enviado_n2'
  | 'reset_senha'

export type NotificacaoCanal = 'whatsapp' | 'email'

export interface TemplateResult {
  ativo: boolean
  assunto: string | null
  corpo: string
}

/** Busca o template da empresa no banco. Retorna null se não encontrado. */
export async function buscarTemplate(
  sb: SupabaseClient,
  empresaId: string,
  tipo: NotificacaoTipo,
  canal: NotificacaoCanal
): Promise<TemplateResult | null> {
  const { data } = await sb
    .from('notificacao_templates')
    .select('ativo, assunto, corpo')
    .eq('empresa_id', empresaId)
    .eq('tipo', tipo)
    .eq('canal', canal)
    .single()

  return data ?? null
}

/** Interpola {{variavel}} no corpo/assunto do template. */
export function renderizar(texto: string, vars: Record<string, string | null | undefined>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, chave) => {
    const val = vars[chave]
    return val != null ? val : ''
  })
}

/** Busca empresa_id a partir de unidade_id. */
export async function empresaDeUnidade(sb: SupabaseClient, unidadeId: string): Promise<string | null> {
  const { data } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
  return (data as any)?.empresa_id ?? null
}

/** Busca empresa_id a partir de subgrupo_id. */
export async function empresaDeSubgrupo(sb: SupabaseClient, subgrupoId: string): Promise<string | null> {
  const { data } = await sb
    .from('subgrupos')
    .select('grupos(unidades(empresa_id))')
    .eq('id', subgrupoId)
    .single()
  return (data as any)?.grupos?.unidades?.empresa_id ?? null
}
