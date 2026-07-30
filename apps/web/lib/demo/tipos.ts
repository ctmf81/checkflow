// Tipos dos TEMPLATES de vertical do gerador de demo. Um template descreve, de
// forma declarativa e pura, tudo que uma empresa-demo daquela vertical tem:
// estrutura, catálogos, checklists (com o "gabarito" de conformidade de cada
// atividade), usuários, motivos de não conformidade, causas raiz, tickets e
// tarefas. A rota (Fase 2) consome isto para provisionar e gerar a massa.

import type { PesosDesfecho } from './gerador'

/** Subconjunto de tipos de atividade usado nas demos (ver lib/tiposAtividade). */
export type TipoAtiv = 'sim_nao' | 'numero' | 'texto' | 'multipla_escolha' | 'catalogo'

export interface AtividadeTemplate {
  nome: string
  tipo: TipoAtiv
  // Gabarito de conformidade (só para tipos que validam):
  simConforme?: 'sim' | 'nao' // sim_nao: qual resposta é a CONFORME (default 'sim')
  faixa?: { min: number; max: number; unidade?: string } // numero: faixa conforme
  opcoes?: string[] // multipla_escolha: todas as opções
  opcoesConformes?: string[] // multipla_escolha: quais são conformes
  // Valores plausíveis para tipos SEM validação (texto):
  valores?: string[]
  // Nome do catálogo consumido (tipo 'catalogo'):
  catalogo?: string
}

export interface SecaoTemplate {
  nome: string
  atividades: AtividadeTemplate[]
}

export interface ChecklistTemplate {
  nome: string
  grupo: string // deve existir em `estrutura`
  subgrupo: string // idem
  secoes: SecaoTemplate[]
  pesos: PesosDesfecho // distribuição de desfechos deste checklist
  porDiaMin: number // execuções por dia útil
  porDiaMax: number
}

export interface CatalogoTemplate {
  nome: string
  campoChave: string
  atributos: string[]
  itens: Record<string, string>[] // cada item tem o campoChave + atributos
}

export type PerfilDemo = 'operacao' | 'nivel_1' | 'nivel_2' | 'gestor'

export interface UsuarioTemplate {
  nome: string
  cpf: string // só dígitos ou formatado; a rota normaliza
  perfil: PerfilDemo
}

export interface TicketTemplate {
  titulo: string
  descricao: string
}

export interface TarefaTemplate {
  titulo: string
  itens: string[]
}

export interface VerticalTemplate {
  id: string // ex.: 'fabrica_alimentos'
  nome: string // ex.: 'Fábrica de Alimentos'
  labelGrupo: string // rótulo do nível grupo (ex.: 'Setor')
  labelSubgrupo: string // rótulo do nível subgrupo (ex.: 'Área')
  unidade: string
  estrutura: { grupo: string; subgrupos: string[] }[]
  catalogos: CatalogoTemplate[]
  checklists: ChecklistTemplate[]
  usuarios: UsuarioTemplate[]
  motivosNaoConformidade: string[]
  causasRaiz: string[]
  tickets: TicketTemplate[]
  tarefas: TarefaTemplate[]
}
