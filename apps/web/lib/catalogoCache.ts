'use client'

// Cache dos VALORES de catálogo em IndexedDB, para a atividade tipo "catálogo"
// funcionar offline (sem isso, CampoCatalogo busca os valores no Supabase ao
// renderizar e fica vazio sem internet).

import type { SupabaseClient } from '@supabase/supabase-js'
import { idbGet, idbPut } from './idb'

const STORE = 'catalogo_cache'

export interface CatalogoSnapshot {
  catalogo: Record<string, unknown> | null
  valores: Record<string, unknown>[]
}

// Busca catálogo + valores no Supabase (online). Retorna null se falhar/offline.
export async function buscarCatalogo(sb: SupabaseClient, catId: string): Promise<CatalogoSnapshot | null> {
  const [{ data: cat }, { data: vals }] = await Promise.all([
    sb.from('catalogos').select('id, nome, campo_chave, atributo_1, atributo_2, atributo_3, atributo_4').eq('id', catId).single(),
    sb.from('catalogo_valores').select('id, valor_chave, atributo_1, atributo_2, atributo_3, atributo_4, imagem_url').eq('catalogo_id', catId).order('valor_chave'),
  ])
  if (!cat && !vals) return null
  return { catalogo: cat ?? null, valores: vals ?? [] }
}

export async function salvarCatalogoCache(catId: string, snap: CatalogoSnapshot): Promise<void> {
  await idbPut(STORE, catId, JSON.parse(JSON.stringify(snap)))
}

export async function carregarCatalogoCache(catId: string): Promise<CatalogoSnapshot | null> {
  return idbGet<CatalogoSnapshot>(STORE, catId)
}
