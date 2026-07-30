// Registry das verticais de demo. Adicionar aqui cada nova vertical.
import type { VerticalTemplate } from '../tipos'
import { fabricaAlimentos } from './fabricaAlimentos'

export const VERTICAIS: Record<string, VerticalTemplate> = {
  [fabricaAlimentos.id]: fabricaAlimentos,
}

/** Template de uma vertical pelo id (ex.: 'fabrica_alimentos'), ou null. */
export function verticalPorId(id: string | null | undefined): VerticalTemplate | null {
  if (!id) return null
  return VERTICAIS[id] ?? null
}

/** Lista para a UI (id + nome). */
export function listarVerticais(): { id: string; nome: string }[] {
  return Object.values(VERTICAIS).map(v => ({ id: v.id, nome: v.nome }))
}
