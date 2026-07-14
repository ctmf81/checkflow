// Compila as EXECUÇÕES de um checklist (numa janela de tempo) num markdown que
// alimenta a IA. É o "documento" da Feature 2 (equivalente ao PDF da Consulta
// Inteligente, mas montado a partir de dados estruturados do banco). Lógica pura.

export interface RespostaCompilar {
  atividade_nome: string
  tipo: string
  resposta: unknown   // jsonb: escalar ou objeto { valor, foto_ia } etc.
  conforme: boolean | null
}
export interface ExecucaoCompilar {
  data_execucao: string        // ISO
  resultado: 'aprovado' | 'reprovado' | null
  executor_nome?: string | null
  respostas: RespostaCompilar[]
}

// Teto de execuções detalhadas no prompt — evita estourar o contexto do modelo
// em checklists muito executados. Acima disso, resume (só as não conformes).
export const LIMITE_EXECUCOES_DETALHE = 40

// Extrai um valor legível de uma resposta jsonb (escalar, ou objeto { valor }).
export function formatarValorResposta(resposta: unknown): string {
  if (resposta === null || resposta === undefined) return '—'
  if (typeof resposta === 'object') {
    const obj = resposta as Record<string, unknown>
    if ('valor' in obj) return formatarValorResposta(obj.valor)
    return JSON.stringify(obj)
  }
  if (typeof resposta === 'boolean') return resposta ? 'sim' : 'não'
  return String(resposta)
}

function formatarData(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function naoConformes(execucao: ExecucaoCompilar): RespostaCompilar[] {
  return execucao.respostas.filter(r => r.conforme === false)
}

// Monta o markdown. `periodoHoras` e `checklistNome` entram no cabeçalho.
export function compilarExecucoesMarkdown(
  checklistNome: string,
  periodoHoras: number,
  periodoDe: string,
  periodoAte: string,
  execucoes: ExecucaoCompilar[],
): string {
  const L: string[] = []
  L.push(`# Execuções do checklist "${checklistNome}"`)
  L.push(`Janela: últimas ${periodoHoras}h (${formatarData(periodoDe)} → ${formatarData(periodoAte)})`)
  L.push('')

  const total = execucoes.length
  const aprovados = execucoes.filter(e => e.resultado === 'aprovado').length
  const reprovados = execucoes.filter(e => e.resultado === 'reprovado').length
  L.push(`Total de execuções: ${total} (aprovadas: ${aprovados}, reprovadas: ${reprovados}).`)
  L.push('')

  if (total === 0) {
    L.push('Nenhuma execução registrada nesse período.')
    return L.join('\n')
  }

  // Ordena da mais recente para a mais antiga
  const ordenadas = [...execucoes].sort(
    (a, b) => new Date(b.data_execucao).getTime() - new Date(a.data_execucao).getTime(),
  )

  const detalhar = ordenadas.length <= LIMITE_EXECUCOES_DETALHE

  ordenadas.forEach((exec, i) => {
    const cab = `## Execução ${i + 1} — ${formatarData(exec.data_execucao)}`
      + (exec.executor_nome ? ` — por ${exec.executor_nome}` : '')
      + ` — ${exec.resultado ?? 'sem resultado'}`
    L.push(cab)

    const nc = naoConformes(exec)
    if (nc.length > 0) {
      L.push('Não conformidades:')
      for (const r of nc) {
        L.push(`- ${r.atividade_nome}: ${formatarValorResposta(r.resposta)}`)
      }
    }
    // Só lista as respostas conformes quando dá para detalhar tudo (poucas execuções).
    if (detalhar) {
      const conformes = exec.respostas.filter(r => r.conforme !== false)
      if (conformes.length > 0) {
        L.push('Respostas:')
        for (const r of conformes) {
          L.push(`- ${r.atividade_nome}: ${formatarValorResposta(r.resposta)}`)
        }
      }
    } else if (nc.length === 0) {
      L.push('Sem não conformidades.')
    }
    L.push('')
  })

  if (!detalhar) {
    L.push(`> Observação: ${ordenadas.length} execuções no período — detalhadas apenas as não conformidades para caber no resumo.`)
  }
  return L.join('\n')
}
