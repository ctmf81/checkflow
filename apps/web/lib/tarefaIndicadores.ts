// Lógica pura dos Indicadores de Tarefas — usada pela página
// (app/gestao/tarefas/[id]/indicadores/page.tsx) e coberta por testes unitários.
// Mantém fora do componente o "cálculo" (feito × não-feito, conclusão média) e a
// extração de evidências/pontos, para facilitar teste e reuso (ex.: PDF).

export interface RespostaInd {
  item_id: string
  feito: boolean
  observacao?: string | null
  evidencia_url?: string | null
  evidencia_tipo?: 'foto' | 'video' | null
  lat?: number | null
  lng?: number | null
  respondido_em?: string
}
export interface ExecucaoInd {
  id: string
  nome: string
  status: string
  aberta_em: string
  respostas: RespostaInd[]
}
export interface ItemInd { id: string; titulo: string; ordem?: number }

export interface StatItem { id: string; titulo: string; feito: number; naoFeito: number; total: number }

/** Uma execução marcou este item como feito? (a resposta existe e feito=true) */
export function itemFeitoNaExecucao(exec: ExecucaoInd, itemId: string): boolean {
  return exec.respostas.some(r => r.item_id === itemId && r.feito)
}

/**
 * Feito × não-feito por tarefa. Denominador = nº de execuções (pessoas); a
 * AUSÊNCIA de resposta conta como não-feito.
 */
export function statsPorItem(itens: ItemInd[], execs: ExecucaoInd[]): StatItem[] {
  const total = execs.length
  return itens.map(it => {
    const feito = execs.reduce((n, e) => n + (itemFeitoNaExecucao(e, it.id) ? 1 : 0), 0)
    return { id: it.id, titulo: it.titulo, feito, naoFeito: total - feito, total }
  })
}

/** % de conclusão média entre as pessoas (média de itens feitos / total de itens). */
export function conclusaoMediaPct(itens: ItemInd[], execs: ExecucaoInd[]): number {
  if (execs.length === 0 || itens.length === 0) return 0
  const soma = execs.reduce((acc, e) => {
    const feitos = itens.filter(it => itemFeitoNaExecucao(e, it.id)).length
    return acc + feitos / itens.length
  }, 0)
  return Math.round((soma / execs.length) * 100)
}

/** Quantos itens esta pessoa marcou como feitos. */
export function feitosDaExecucao(itens: ItemInd[], exec: ExecucaoInd): number {
  return itens.filter(it => itemFeitoNaExecucao(exec, it.id)).length
}

export interface Evidencia {
  url: string; tipo: 'foto' | 'video'; pessoa: string; item: string
  respondido_em?: string; lat?: number | null; lng?: number | null
}

/** Todas as evidências (foto/vídeo) achatadas, com autor e nome do item. */
export function extrairEvidencias(execs: ExecucaoInd[], tituloItem: Map<string, string>): Evidencia[] {
  return execs.flatMap(e =>
    e.respostas.filter(r => r.evidencia_url).map(r => ({
      url: r.evidencia_url!, tipo: (r.evidencia_tipo ?? 'foto') as 'foto' | 'video',
      pessoa: e.nome, item: tituloItem.get(r.item_id) ?? 'Item',
      respondido_em: r.respondido_em, lat: r.lat ?? null, lng: r.lng ?? null,
    })),
  )
}

export interface PontoGeo { lat: number; lng: number; pessoa: string; item: string; respondido_em?: string }

/** Pontos das respostas com check-in (lat/lng não nulos). */
export function extrairPontos(execs: ExecucaoInd[], tituloItem: Map<string, string>): PontoGeo[] {
  return execs.flatMap(e =>
    e.respostas.filter(r => r.lat != null && r.lng != null).map(r => ({
      lat: r.lat as number, lng: r.lng as number, pessoa: e.nome,
      item: tituloItem.get(r.item_id) ?? 'Item', respondido_em: r.respondido_em,
    })),
  )
}
