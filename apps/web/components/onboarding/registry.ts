import { OnboardingCardData } from './OnboardingPanel'
import {
  ONBOARDING_TICKETS,
  ONBOARDING_OPERACAO,
  ONBOARDING_CHECKLISTS,
  ONBOARDING_PLANOS_ACAO,
  ONBOARDING_WORKFLOWS,
  ONBOARDING_PERFIS,
} from './configs'

export interface OnboardingPageConfig {
  /** Identificador único da página — também usado como chave em `onboarding_paginas` */
  pageId: string
  /** Título exibido no topo do painel */
  titulo: string
  /** Conteúdo padrão (usado se não houver override cadastrado em `/sistema/onboarding`) */
  cards: OnboardingCardData[]
}

/**
 * Registro central de todas as telas com onboarding contextual.
 *
 * Toda vez que uma tela ou funcionalidade nova for criada:
 * 1. Adicione uma entrada aqui com `pageId`, `titulo` e `cards`.
 * 2. Adicione `<Onboarding pageId="..." titulo="..." cards={...} />` na página.
 * 3. Rode a migration de seed (ou insira manualmente) em `onboarding_paginas`.
 * 4. Se a tela expõe uma funcionalidade nova, adicione o recurso correspondente
 *    em `apps/web/app/gestao/acessos/perfis/permissoes.ts`.
 *
 * O painel "/sistema/onboarding" permite ativar/desativar e editar o conteúdo
 * de cada item sem precisar alterar código.
 */
export const ONBOARDING_REGISTRY: OnboardingPageConfig[] = [
  {
    pageId: 'gestao-home',
    titulo: 'Painel de Gestão',
    cards: [
      {
        icon: '🏠',
        titulo: 'Sua central de gestão',
        texto: 'Aqui você acompanha indicadores, atalhos rápidos e pendências da sua unidade. Use o menu lateral para navegar entre os módulos.',
        dicas: [
          'O menu se adapta às suas permissões de perfil',
          'Troque de empresa/unidade pelo seletor no topo',
        ],
      },
    ],
  },
  {
    pageId: 'acessos-empresa',
    titulo: 'Dados da Empresa',
    cards: [
      {
        icon: '🏢',
        titulo: 'Cadastro da empresa',
        texto: 'Gerencie os dados cadastrais, unidades e configurações gerais da sua empresa nesta tela.',
        dicas: [
          'Alterações aqui afetam toda a empresa, não só a unidade atual',
        ],
      },
    ],
  },
  {
    pageId: 'acessos-turnos',
    titulo: 'Turnos',
    cards: [
      {
        icon: '🕒',
        titulo: 'Turnos de trabalho',
        texto: 'Defina os horários de turno da unidade. Eles controlam quando notificações de WhatsApp são enviadas — fora do turno, o usuário recebe apenas e-mail.',
        dicas: [
          'Cada usuário pode ser vinculado a um turno',
          'Sem turno definido, notificações chegam a qualquer horário',
        ],
      },
    ],
  },
  {
    pageId: 'acessos-usuarios',
    titulo: 'Usuários',
    cards: [
      {
        icon: '👤',
        titulo: 'Gerenciando usuários',
        texto: 'Cadastre usuários e vincule-os a perfis de acesso, unidades, grupos e turnos.',
        dicas: [
          'Um usuário pode ter perfis diferentes em empresas diferentes',
          'O perfil define o que o usuário vê e pode fazer',
        ],
      },
    ],
  },
  {
    pageId: 'agendamentos',
    titulo: 'Agendamentos',
    cards: [
      {
        icon: '📅',
        titulo: 'Disparo automático',
        texto: 'Agende a liberação automática de checklists e workflows em datas e horários recorrentes, sem depender de ação manual.',
        dicas: [
          'Suporta recorrência diária, semanal e mensal',
          'Itens agendados aparecem na Operação no horário definido',
        ],
      },
    ],
  },
  {
    pageId: 'checklists',
    titulo: 'Checklists',
    cards: ONBOARDING_CHECKLISTS,
  },
  {
    pageId: 'checklists-novo',
    titulo: 'Criar Checklist',
    cards: [
      {
        icon: '✏️',
        titulo: 'Montando seu checklist',
        texto: 'Adicione seções e atividades. Cada atividade pode ter um tipo de resposta (sim/não, número, foto, etc.) e regras de validação automática.',
        dicas: [
          'Salve como rascunho antes de publicar',
          'Use atividades dependentes para fluxos condicionais',
        ],
      },
    ],
  },
  {
    pageId: 'config-catalogos',
    titulo: 'Catálogos',
    cards: [
      {
        icon: '📚',
        titulo: 'Itens reutilizáveis',
        texto: 'Cadastre listas de itens (equipamentos, produtos, locais) que podem ser reutilizadas em múltiplos checklists e atividades.',
      },
    ],
  },
  {
    pageId: 'config-causa-raiz',
    titulo: 'Causas Raiz',
    cards: [
      {
        icon: '🔍',
        titulo: 'Categorias de causa raiz',
        texto: 'Cadastre as causas raiz padrão usadas ao tratar planos de ação. Isso ajuda a identificar problemas recorrentes nos indicadores.',
      },
    ],
  },
  {
    pageId: 'config-documentos',
    titulo: 'Documentos',
    cards: [
      {
        icon: '📄',
        titulo: 'Documentos da unidade',
        texto: 'Centralize documentos de referência (procedimentos, normas, manuais) que podem ser anexados ou consultados durante a execução.',
      },
    ],
  },
  {
    pageId: 'config-formatacao',
    titulo: 'Formatação',
    cards: [
      {
        icon: '🎨',
        titulo: 'Identidade visual',
        texto: 'Personalize logo, cores e o layout dos relatórios em PDF gerados pelo sistema.',
      },
    ],
  },
  {
    pageId: 'config-nao-execucao',
    titulo: 'Motivos de Não Execução',
    cards: [
      {
        icon: '🚫',
        titulo: 'Justificando não execuções',
        texto: 'Cadastre os motivos disponíveis quando um checklist não pode ser executado (ex: equipamento parado, área interditada).',
      },
    ],
  },
  {
    pageId: 'config-notificacoes',
    titulo: 'Notificações',
    cards: [
      {
        icon: '🔔',
        titulo: 'Templates de notificação',
        texto: 'Edite o texto das mensagens enviadas por WhatsApp e e-mail para cada evento do sistema (planos de ação, tickets, workflows etc.).',
        dicas: [
          'Use {{variaveis}} para inserir dados dinâmicos',
          'Cada canal (WhatsApp/Email) pode ter um texto diferente',
        ],
      },
    ],
  },
  {
    pageId: 'grupos',
    titulo: 'Grupos e Subgrupos',
    cards: [
      {
        icon: '🗂️',
        titulo: 'Estrutura organizacional',
        texto: 'Grupos e subgrupos representam as áreas/setores da unidade. Eles são usados para direcionar checklists, tickets e planos de ação ao time certo.',
      },
    ],
  },
  {
    pageId: 'indicadores',
    titulo: 'Indicadores',
    cards: [
      {
        icon: '📊',
        titulo: 'Acompanhamento de desempenho',
        texto: 'Visualize gráficos e métricas consolidadas: execuções, conformidade, planos de ação e tickets por período.',
        dicas: [
          'Use os filtros para analisar por unidade, grupo ou período',
        ],
      },
    ],
  },
  {
    pageId: 'padrao-criar',
    titulo: 'Criar Padrão',
    cards: [
      {
        icon: '🖼️',
        titulo: 'Padrões de referência',
        texto: 'Crie um padrão visual (foto/imagem de referência) com variáveis marcadas, usado para comparar o resultado de uma atividade ao executar o checklist.',
      },
    ],
  },
  {
    pageId: 'padrao-padroes',
    titulo: 'Padrões',
    cards: [
      {
        icon: '🗃️',
        titulo: 'Lista de padrões',
        texto: 'Veja todos os padrões cadastrados, edite ou vincule a atividades de checklists.',
      },
    ],
  },
  {
    pageId: 'padrao-variaveis',
    titulo: 'Variáveis de Padrão',
    cards: [
      {
        icon: '🔣',
        titulo: 'Variáveis reutilizáveis',
        texto: 'Cadastre variáveis (pontos de verificação) que podem ser usadas em múltiplos padrões, com valores mínimo/máximo esperados.',
      },
    ],
  },
  {
    pageId: 'planos-acao',
    titulo: 'Planos de Ação',
    cards: ONBOARDING_PLANOS_ACAO,
  },
  {
    pageId: 'tickets',
    titulo: 'Tickets / Chamados',
    cards: ONBOARDING_TICKETS,
  },
  {
    pageId: 'tickets-categorias',
    titulo: 'Categorias de Ticket',
    cards: [
      {
        icon: '🏷️',
        titulo: 'Organizando chamados',
        texto: 'Cadastre as categorias usadas para classificar tickets (ex: manutenção, TI, limpeza). Cada grupo/subgrupo pode ter categorias próprias.',
      },
    ],
  },
  {
    pageId: 'tickets-sla',
    titulo: 'SLA de Tickets',
    cards: [
      {
        icon: '⏱',
        titulo: 'Prazos por prioridade',
        texto: 'Configure o prazo (SLA) de atendimento para cada nível de prioridade (crítica, alta, média, baixa). Esses prazos alimentam o semáforo na lista de tickets.',
      },
    ],
  },
  {
    pageId: 'workflows',
    titulo: 'Workflows',
    cards: ONBOARDING_WORKFLOWS,
  },
  {
    pageId: 'workflows-novo',
    titulo: 'Criar Workflow',
    cards: [
      {
        icon: '🧱',
        titulo: 'Montando o workflow',
        texto: 'Defina os estágios em sequência e os checklists de cada estágio. Configure a condição de avanço de cada estágio antes de publicar.',
      },
    ],
  },
  {
    pageId: 'operacao',
    titulo: 'Operação',
    cards: ONBOARDING_OPERACAO,
  },
  {
    pageId: 'perfis',
    titulo: 'Perfis de Acesso',
    cards: ONBOARDING_PERFIS,
  },
  {
    pageId: 'sistema-empresas',
    titulo: 'Painel de Sistema',
    cards: [
      {
        icon: '🛡️',
        titulo: 'Administração global',
        texto: 'Aqui você gerencia todas as empresas da plataforma: criar novas empresas, acessar como administrador e ver detalhes de cada conta.',
      },
    ],
  },
  {
    pageId: 'sistema-whatsapp',
    titulo: 'WhatsApp (sistema)',
    cards: [
      {
        icon: '📱',
        titulo: 'Conexão com WhatsApp',
        texto: 'Gerencie a conexão da instância do WhatsApp (Evolution API) usada para enviar notificações às empresas.',
        dicas: [
          'Escaneie o QR Code para reconectar a sessão',
        ],
      },
    ],
  },
  {
    pageId: 'sistema-termos',
    titulo: 'Termos de Uso',
    cards: [
      {
        icon: '📜',
        titulo: 'Termos de uso da plataforma',
        texto: 'Edite o termo de uso que os usuários precisam aceitar para continuar usando o sistema.',
      },
    ],
  },
  {
    pageId: 'sistema-onboarding',
    titulo: 'Configuração de Onboarding',
    cards: [
      {
        icon: '🧭',
        titulo: 'Gerenciando o onboarding',
        texto: 'Ative ou desative o painel de dicas de cada tela e edite o conteúdo exibido aos usuários, sem precisar alterar código.',
        dicas: [
          'Desativar aqui esconde o painel e o ícone "?" para todos os usuários',
          'A edição de conteúdo usa formato JSON — siga a estrutura de exemplo',
        ],
      },
    ],
  },
]

export function getOnboardingConfig(pageId: string): OnboardingPageConfig | undefined {
  return ONBOARDING_REGISTRY.find(c => c.pageId === pageId)
}
