// Monta o PROMPT-MODELO pré-preenchido a partir da estrutura do checklist.
// Ideia: expor ao usuário os campos que a IA vai enxergar (seções + atividades),
// para ele não ter que procurar quais existem. O texto é editável no cadastro do
// modelo e salvo em relatorio_modelos.prompt. Lógica pura → testável.

export interface AtividadeEstrutura {
  nome: string
  tipo: string
}
export interface SecaoEstrutura {
  nome: string
  atividades: AtividadeEstrutura[]
}

// Rótulo curto do tipo, só para orientar o leitor do prompt.
const TIPO_LABEL: Record<string, string> = {
  sim_nao: 'sim/não',
  numero: 'número',
  texto: 'texto',
  multipla_escolha: 'múltipla escolha',
  catalogo: 'catálogo',
  foto: 'foto',
  assinatura: 'assinatura',
  data_hora: 'data/hora',
  localizacao: 'localização',
}

export function rotuloTipo(tipo: string): string {
  return TIPO_LABEL[tipo] ?? tipo
}

// Gera o texto-modelo. `checklistNome` e as seções vêm do checklist escolhido.
export function montarPromptModelo(
  checklistNome: string,
  secoes: SecaoEstrutura[],
): string {
  const linhas: string[] = []
  linhas.push(
    `Gere um relatório gerencial das execuções do checklist "${checklistNome}" no período informado.`,
  )
  linhas.push('')

  const secoesComItens = secoes.filter(s => s.atividades.length > 0)
  if (secoesComItens.length > 0) {
    linhas.push('Itens verificados no checklist:')
    for (const secao of secoesComItens) {
      linhas.push(`- ${secao.nome}`)
      for (const atv of secao.atividades) {
        linhas.push(`  • ${atv.nome} (${rotuloTipo(atv.tipo)})`)
      }
    }
    linhas.push('')
  }

  linhas.push(
    'Destaque: itens não conformes, valores fora do padrão, execuções faltantes e tendências no período. Seja objetivo e organize por seção.',
  )
  return linhas.join('\n')
}
