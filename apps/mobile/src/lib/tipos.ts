// ─── Tipos compartilhados entre web e mobile ───────────────────────────────

export type TipoAtividade =
  | 'sim_nao' | 'numero' | 'texto' | 'multipla_escolha'
  | 'catalogo' | 'foto' | 'video' | 'assinatura'
  | 'data_hora' | 'localizacao' | 'padrao'

export interface ConfigAtividade {
  // sim_nao
  esperado?: 'sim' | 'nao'
  // numero
  min?: number | null
  max?: number | null
  unidade?: string
  // texto
  mascara?: string
  qrcode?: boolean
  // multipla_escolha
  multipla?: boolean
  // catalogo
  catalogo_id?: string
  // padrao
  padrao_id?: string
  // localizacao
  lat?: number
  lng?: number
  raio_metros?: number
  automatico?: boolean
  [key: string]: any
}

export interface OpcaoMC {
  id: string
  label: string
  valor: string
  ordem: number
  e_valido: boolean
}

export interface Atividade {
  id: string
  nome: string
  tipo: TipoAtividade
  obrigatoria: boolean
  critica: boolean
  gera_plano_acao: boolean
  plano_acao_sla_horas: number | null
  config: ConfigAtividade
  ordem: number
  secao_id: string | null
  atividade_pai_id: string | null
  valor_gatilho: string | null
  dependentes?: Atividade[]
  opcoesMC?: OpcaoMC[]
  resposta?: any // preenchido durante execução
}

export interface Secao {
  id: string
  nome: string
  ordem: number
  atividades: Atividade[]
}

export interface Checklist {
  id: string
  nome: string
  descricao: string | null
  tempo_guarda_meses: number
  subgrupo_id: string | null
  secoes: Secao[]
  versao: number
}

export interface CatalogoValor {
  id: string
  catalogo_id: string
  valor_chave: string
  atributo_1?: string
  atributo_2?: string
  atributo_3?: string
  atributo_4?: string
  imagem_url?: string
}

export interface PadraoInstancia {
  id: string
  padrao_id: string
  valores: Record<string, string> // { var_id: valor, ... }
  valor_min: number | null
  valor_max: number | null
}

export interface MotivoNaoExecucao {
  id: string
  descricao: string
  tipo: 'checklist' | 'atividade'
}

export interface ChecklistExecucao {
  id: string
  checklist_id: string
  unidade_id: string
  usuario_id: string
  data_inicio: string // ISO
  data_conclusao?: string // ISO
  status: 'em_andamento' | 'concluido' | 'nao_executado'
  resultado?: 'aprovado' | 'reprovado' // calc no finalizar
  respostas: Record<string, any>
  motivo_nao_execucao_id?: string
  motivo_nao_execucao_obs?: string
  sincronizado: boolean // true após POST sucesso
  sincronizado_em?: string // ISO
}

export interface PlanoAcaoRascunho {
  id: string // UUID local
  checklist_execucao_id: string
  atividade_id: string
  status: 'em_moderacao_n1'
  causa_raiz_id?: string
  observacao?: string
  sincronizado: boolean
  sincronizado_em?: string
}

export interface SincronizacaoPayload {
  execucoes: ChecklistExecucao[]
  planos: PlanoAcaoRascunho[]
  timestamp: string // ISO
}

export interface AuthToken {
  cpf: string
  telefone: string
  token: string
  empresaId: string
  unidadeId: string
  usuarioId: string
  expiresAt: string // ISO
}
