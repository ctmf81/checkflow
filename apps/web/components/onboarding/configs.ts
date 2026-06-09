import { OnboardingCardData } from './OnboardingPanel'

export const ONBOARDING_TICKETS: OnboardingCardData[] = [
  {
    icon: '🎯',
    titulo: 'Para que serve?',
    texto: 'Aqui você abre e acompanha chamados para qualquer área da unidade. Qualquer pessoa pode abrir — basta escolher o grupo e subgrupo destino.',
    dicas: [
      'Grupo e subgrupo são obrigatórios',
      'Quem estiver no subgrupo destino pode assumir',
      'Você também pode abrir pela tela de Operação',
    ],
  },
  {
    icon: '🔄',
    titulo: 'Como funciona o fluxo?',
    texto: 'Cada movimentação exige uma observação escrita. A timeline fica registrada e nunca pode ser apagada.',
    fluxo: ['aberto', 'assumido', 'aguard. info', 'validação', '✅ corrigido'],
  },
  {
    icon: '⏱',
    titulo: 'SLA e Prioridade',
    texto: 'O prazo é calculado automaticamente conforme a prioridade. Enquanto o ticket aguarda informação, o SLA fica pausado.',
    dicas: [
      '🔴 Crítica — menor prazo',
      '🟠 Alta  🟡 Média  🟢 Baixa',
      'Semáforo verde/amarelo/vermelho na lista',
      'Configure prazos em Config. SLA',
    ],
  },
]

export const ONBOARDING_OPERACAO: OnboardingCardData[] = [
  {
    icon: '📋',
    titulo: 'Sua área de trabalho',
    texto: 'Aqui ficam todos os checklists disponíveis para você executar, organizados por grupo e área. Também é onde você abre chamados avulsos.',
    dicas: [
      'Só aparecem checklists publicados',
      'Workflows em andamento aparecem primeiro',
      'Botão "Abrir Ticket" para qualquer chamado rápido',
    ],
  },
  {
    icon: '✅',
    titulo: 'Executando um checklist',
    texto: 'Responda cada atividade em ordem. Se algo não estiver conforme, um Plano de Ação pode ser aberto automaticamente para registrar e resolver o problema.',
    dicas: [
      'Atividades obrigatórias bloqueiam o envio',
      'Fotos, vídeos e localização são aceitos',
      'Histórico completo na aba "Histórico"',
    ],
  },
]

export const ONBOARDING_CHECKLISTS: OnboardingCardData[] = [
  {
    icon: '📝',
    titulo: 'Gerenciando checklists',
    texto: 'Crie e publique checklists para sua unidade. Um checklist publicado gera um snapshot imutável — para alterar a estrutura, crie uma nova versão.',
    dicas: [
      'Rascunho → Publicado → Inativo',
      'Publicado não pode ter estrutura alterada',
      'Use "Duplicar" para criar variações rápidas',
    ],
  },
  {
    icon: '🧩',
    titulo: 'Tipos de atividade',
    texto: 'Cada atividade pode ter validação automática. Atividades dependentes só aparecem quando uma resposta específica for dada.',
    dicas: [
      'Sim/Não, Número, Múltipla escolha → validam automaticamente',
      'Foto, Vídeo, Texto → apenas registro',
      'Atividade dependente: aparece só se o "pai" tiver resposta esperada',
    ],
  },
]

export const ONBOARDING_PLANOS_ACAO: OnboardingCardData[] = [
  {
    icon: '🔴',
    titulo: 'O que é um Plano de Ação?',
    texto: 'É aberto automaticamente quando uma atividade não conforme é registrada em um checklist. Registra o problema e acompanha a resolução.',
    dicas: [
      'Criado pelo executor no momento da não conformidade',
      'Notifica moderadores N1 imediatamente',
      'Evidências (fotos/vídeos) podem ser anexadas',
    ],
  },
  {
    icon: '👥',
    titulo: 'Moderação N1 e N2',
    texto: 'O N1 recebe o plano primeiro. Se não conseguir resolver, escala para o N2. Cada nível registra suas observações.',
    fluxo: ['N1 recebe', 'N1 modera', 'N1 escala (se necessário)', 'N2 resolve'],
  },
  {
    icon: '⏰',
    titulo: 'Prazo e SLA',
    texto: 'O prazo é configurado pelo administrador. Planos vencidos ficam destacados em vermelho. Turnos são respeitados — notificações só chegam a quem está no horário.',
    dicas: [
      'SLA configurado por checklist ou global',
      'Fora do turno → recebe email, não WhatsApp',
      'Reaberto se a solução for rejeitada',
    ],
  },
]

export const ONBOARDING_WORKFLOWS: OnboardingCardData[] = [
  {
    icon: '⚙️',
    titulo: 'O que é um Workflow?',
    texto: 'É uma sequência de estágios onde cada estágio tem um ou mais checklists. O sistema avança automaticamente quando as condições são cumpridas.',
    dicas: [
      'Estágios são sequenciais',
      'Dentro de um estágio os checklists são paralelos',
      'Transversal à unidade — pertence à empresa',
    ],
  },
  {
    icon: '🔀',
    titulo: 'Condições de avanço',
    texto: 'Você define quando um estágio avança para o próximo. O motor roda inteiramente no banco de dados — sem delay.',
    dicas: [
      '"Todos aprovados" — mais rigoroso',
      '"Todos concluídos" — aceita reprovados',
      '"Qualquer aprovado" — mais flexível',
    ],
  },
  {
    icon: '▶️',
    titulo: 'Executando workflows',
    texto: 'Após publicar e iniciar, os checklists liberados aparecem na tela de Operação na seção "Workflows em andamento", na frente dos checklists avulsos.',
    dicas: [
      'Publicar bloqueia edições estruturais',
      'Checklist usado em workflow publicado não pode ser inativado',
      'Use Agendamentos para disparar workflows automaticamente',
    ],
  },
]

export const ONBOARDING_PERFIS: OnboardingCardData[] = [
  {
    icon: '🔐',
    titulo: 'Controle de acesso',
    texto: 'Perfis definem o que cada usuário pode ver e fazer. Um usuário sem permissão não vê a funcionalidade — nem no menu.',
    dicas: [
      'Perfis "públicos" podem ser atribuídos por líderes de área',
      'Perfis "não públicos" só o Admin da empresa pode atribuir',
      'Admin de sistema tem acesso total sempre',
    ],
  },
  {
    icon: '🏗️',
    titulo: 'Como organizar',
    texto: 'Crie um perfil por função real da empresa (ex: Operador, Supervisor, Gerente). Evite criar um perfil por pessoa.',
    dicas: [
      'Marque como "público" perfis de substituição temporária',
      'Permissões granulares: ver ≠ criar ≠ editar ≠ excluir',
      'Teste o perfil logando com um usuário de teste',
    ],
  },
]
