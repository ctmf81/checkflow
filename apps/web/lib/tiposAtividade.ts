// Tipos de atividade do montador de checklist + gating por serviço do plano.
// Regra (opt-in, igual ao menu): um tipo ligado a um serviço GATEADO some do
// montador quando o plano não inclui esse serviço. `recurso` = módulo
// (recursosHabilitados); `flag` = característica (flagsHabilitadas). null = sem
// restrição (mostra tudo). Lógica pura importada por AtividadeModal + testada.

import { planoLiberaRecurso, planoLiberaFlag } from './entitlements/gating'

export interface TipoAtividade {
  value: string
  label: string
  validacao: boolean
  recurso?: string   // módulo do plano que libera este tipo (ex.: 'catalogos')
  flag?: string      // característica do plano (ex.: 'ia')
}

export const TIPOS_ATIVIDADE: TipoAtividade[] = [
  { value: 'sim_nao',          label: 'Sim/Não',          validacao: true  },
  { value: 'numero',           label: 'Número',            validacao: true  },
  { value: 'texto',            label: 'Texto',             validacao: false },
  { value: 'multipla_escolha', label: 'Múltipla escolha',  validacao: true  },
  { value: 'catalogo',         label: 'Catálogo',          validacao: false, recurso: 'catalogos' },
  { value: 'foto',             label: 'Foto',              validacao: false },
  { value: 'video',            label: 'Vídeo',             validacao: false },
  { value: 'assinatura',       label: 'Assinatura',        validacao: false },
  { value: 'data_hora',        label: 'Data/Hora',         validacao: false },
  { value: 'localizacao',      label: 'Localização',       validacao: true  },
  // Quando o tipo "Padrão" voltar ao montador, gatear pelo módulo 'padrao':
  // { value: 'padrao',        label: 'Padrão',            validacao: true,  recurso: 'padrao' },
]

/** Um tipo específico está liberado pelo plano? */
export function tipoLiberado(
  tipo: TipoAtividade,
  recursosHabilitados: Set<string> | null,
  flagsHabilitadas: Set<string> | null,
): boolean {
  if (tipo.flag && !planoLiberaFlag(flagsHabilitadas, tipo.flag)) return false
  if (tipo.recurso && !planoLiberaRecurso(recursosHabilitados, tipo.recurso)) return false
  return true
}

/**
 * Tipos oferecidos no montador conforme o plano. `tipoAtual` (edição) é sempre
 * incluído mesmo se gateado — para não travar a edição de uma atividade já
 * criada quando o plano deixou de incluir o serviço.
 */
export function tiposAtividadeDisponiveis(
  recursosHabilitados: Set<string> | null,
  flagsHabilitadas: Set<string> | null,
  tipoAtual?: string,
): TipoAtividade[] {
  const lista = TIPOS_ATIVIDADE.filter(t => tipoLiberado(t, recursosHabilitados, flagsHabilitadas))
  if (tipoAtual && !lista.some(t => t.value === tipoAtual)) {
    const atual = TIPOS_ATIVIDADE.find(t => t.value === tipoAtual)
    if (atual) lista.push(atual)
  }
  return lista
}
