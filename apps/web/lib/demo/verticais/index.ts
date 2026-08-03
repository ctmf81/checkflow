// Registry das verticais de demo. Adicionar aqui cada nova vertical.
import type { VerticalTemplate } from '../tipos'
import { fabricaAlimentos } from './fabricaAlimentos'
import { condominio } from './condominio'
import { redeLojas } from './redeLojas'
import { hospital } from './hospital'
import { agronegocio } from './agronegocio'
import { fabricaTransformacao } from './fabricaTransformacao'
import { agropecuaria } from './agropecuaria'
import { hotel } from './hotel'
import { empresa } from './empresa'

export const VERTICAIS: Record<string, VerticalTemplate> = {
  [fabricaAlimentos.id]: fabricaAlimentos,
  [condominio.id]: condominio,
  [redeLojas.id]: redeLojas,
  [hospital.id]: hospital,
  [agronegocio.id]: agronegocio,
  [fabricaTransformacao.id]: fabricaTransformacao,
  [agropecuaria.id]: agropecuaria,
  [hotel.id]: hotel,
  [empresa.id]: empresa,
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
