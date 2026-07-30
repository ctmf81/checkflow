// Mapeamento PURO template → linhas do banco, para o gerador:
//  • config jsonb de checklist_atividades por tipo;
//  • se a atividade valida (pode reprovar) → critica + gera_plano_acao;
//  • geração de uma resposta CONFORME ou NÃO CONFORME (jsonb + flag `conforme`),
//    no formato que o ExecucaoViewer lê ({ valor } / { valor_chave }).
// Tudo determinístico via rng — testável sem banco.

import type { Rng } from './gerador'
import { inteiro, escolher } from './gerador'
import type { AtividadeTemplate } from './tipos'

/** Tipos que reprovam (viram critica + gera_plano_acao). */
export function atividadeValida(a: AtividadeTemplate): boolean {
  return a.tipo === 'sim_nao' || a.tipo === 'numero' || a.tipo === 'multipla_escolha'
}

/**
 * config jsonb de checklist_atividades. `catalogoId` resolve o tipo 'catalogo'.
 * Espelha os formatos documentados na migration de checklists.
 */
export function configAtividade(a: AtividadeTemplate, catalogoId?: string | null): Record<string, unknown> {
  switch (a.tipo) {
    case 'sim_nao':
      return { esperado: a.simConforme ?? 'sim' }
    case 'numero':
      return a.faixa ? { min: a.faixa.min, max: a.faixa.max, unidade: a.faixa.unidade ?? '' } : {}
    case 'multipla_escolha':
      return { multipla: false }
    case 'catalogo':
      return catalogoId ? { catalogo_id: catalogoId } : {}
    default:
      return {}
  }
}

export interface RespostaGerada {
  resposta: unknown // jsonb salvo em checklist_execucao_respostas.resposta
  conforme: boolean | null // null quando o tipo não valida
}

/** Valor numérico fora da faixa (abaixo do min ou acima do max). */
function numeroForaDaFaixa(a: AtividadeTemplate, rng: Rng): number {
  const f = a.faixa!
  const amplitude = Math.max(1, Math.round((f.max - f.min) * 0.3) || 3)
  return rng() < 0.5 ? f.min - inteiro(rng, 1, amplitude) : f.max + inteiro(rng, 1, amplitude)
}

/**
 * Gera a resposta de uma atividade.
 * @param conforme  para tipos que validam: true = conforme, false = não conforme.
 *                  Tipos sem validação ignoram e retornam conforme=null.
 * @param catalogoValores  itens do catálogo (chave já resolvida) p/ tipo catalogo.
 */
export function gerarResposta(
  a: AtividadeTemplate,
  conforme: boolean,
  rng: Rng,
  catalogoValores?: string[],
): RespostaGerada {
  switch (a.tipo) {
    case 'sim_nao': {
      const ok = a.simConforme ?? 'sim'
      const nao = ok === 'sim' ? 'nao' : 'sim'
      return { resposta: { valor: conforme ? ok : nao }, conforme }
    }
    case 'numero': {
      const f = a.faixa!
      const valor = conforme ? inteiro(rng, f.min, f.max) : numeroForaDaFaixa(a, rng)
      return { resposta: { valor }, conforme }
    }
    case 'multipla_escolha': {
      const conformes = a.opcoesConformes ?? []
      const naoConformes = (a.opcoes ?? []).filter(o => !conformes.includes(o))
      const pool = conforme ? conformes : (naoConformes.length ? naoConformes : conformes)
      return { resposta: { valor: escolher(rng, pool) }, conforme }
    }
    case 'catalogo': {
      const chave = catalogoValores?.length ? escolher(rng, catalogoValores) : ''
      return { resposta: { valor_chave: chave, valor: chave }, conforme: null }
    }
    case 'texto':
    default: {
      const valor = a.valores?.length ? escolher(rng, a.valores) : '—'
      return { resposta: { valor }, conforme: null }
    }
  }
}
