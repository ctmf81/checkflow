'use client'

// Busca a definição completa de um checklist e devolve no formato de snapshot
// do cache offline (ChecklistSnapshot). Usado para PRÉ-CACHEAR os checklists
// marcados como "disponível offline", para que abram sem internet mesmo sem
// terem sido abertos antes.
//
// IMPORTANTE: as queries aqui devem espelhar as da tela de execução
// (operacao/[id]/page.tsx > carregar) para que o snapshot seja idêntico.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChecklistSnapshot } from './checklistCache'

export async function buscarDefinicaoChecklist(
  sb: SupabaseClient,
  checklistId: string,
  unidadeId: string,
): Promise<ChecklistSnapshot | null> {
  const { data: cl } = await sb.from('checklists')
    .select('id, nome, descricao, tempo_guarda_meses, subgrupo_id, permite_continuar_depois')
    .eq('id', checklistId).eq('unidade_id', unidadeId).single()
  if (!cl) return null

  const { data: secoesData } = await sb.from('checklist_secoes')
    .select('id, nome, ordem').eq('checklist_id', checklistId).order('ordem')

  const { data: atvsData } = await sb.from('checklist_atividades')
    .select('id, nome, tipo, obrigatoria, critica, gera_plano_acao, plano_acao_sla_horas, config, ordem, atividade_pai_id, valor_gatilho, secao_id')
    .eq('checklist_id', checklistId).order('ordem')
  if (!atvsData || atvsData.length === 0) return null

  const idsMC = atvsData.filter((a: any) => a.tipo === 'multipla_escolha').map((a: any) => a.id)
  const opcoesMap: Record<string, Record<string, unknown>[]> = {}
  if (idsMC.length > 0) {
    const { data: opcs } = await sb.from('checklist_atividade_opcoes')
      .select('id, atividade_id, label, valor, ordem, e_valido')
      .in('atividade_id', idsMC).order('ordem')
    for (const op of (opcs ?? [])) {
      if (!opcoesMap[op.atividade_id]) opcoesMap[op.atividade_id] = []
      opcoesMap[op.atividade_id].push(op)
    }
  }

  const { data: motivosVinculo } = await sb
    .from('checklist_nao_execucao_motivos')
    .select('motivo:motivo_id(id, descricao, tipo)')
    .eq('checklist_id', checklistId)
  const motivos = (motivosVinculo ?? [])
    .map((m: any) => Array.isArray(m.motivo) ? m.motivo[0] : m.motivo)
    .filter(Boolean)

  return {
    cl, secoesData: secoesData ?? [], atvsData, opcoesMap, motivos, cachedAt: Date.now(),
  } as ChecklistSnapshot
}
