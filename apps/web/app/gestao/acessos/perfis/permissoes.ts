export interface Acao {
  key: string
  label: string
}

export interface Recurso {
  key: string
  label: string
  acoes: Acao[]
}

import { WORKFLOWS_HABILITADO } from '@/lib/features'

const recursosTodos: Recurso[] = [
  {
    key: 'home',
    label: 'Home',
    acoes: [],
  },
  {
    key: 'checklists',
    label: 'Checklists',
    acoes: [
      { key: 'criar',          label: 'Criar checklist' },
      { key: 'editar',         label: 'Editar checklist' },
      { key: 'excluir',        label: 'Excluir checklist' },
      { key: 'configuracoes',  label: 'Configurações checklist' },
      { key: 'duplicar',       label: 'Duplicar checklist' },
    ],
  },
  {
    key: 'grupos',
    label: 'Grupos',
    acoes: [
      { key: 'criar',              label: 'Criar grupo' },
      { key: 'editar',             label: 'Editar grupo' },
      { key: 'excluir',            label: 'Excluir grupo' },
      { key: 'adicionar_usuario',  label: 'Adicionar usuário ao grupo' },
      { key: 'gerenciar_usuario',  label: 'Gerenciar usuários do grupo (remover, trocar)' },
    ],
  },
  {
    key: 'subgrupos',
    label: 'Áreas',
    acoes: [
      { key: 'criar',              label: 'Criar área' },
      { key: 'editar',             label: 'Editar área' },
      { key: 'excluir',            label: 'Excluir área' },
      { key: 'gerenciar_funcoes',  label: 'Gerenciar funções (N1 / N2 / Executor)' },
    ],
  },
  {
    key: 'workflows',
    label: 'Workflows',
    acoes: [
      { key: 'criar',    label: 'Criar workflow' },
      { key: 'editar',   label: 'Editar workflow' },
      { key: 'publicar', label: 'Publicar / inativar workflow' },
      { key: 'excluir',  label: 'Excluir workflow' },
      { key: 'iniciar',  label: 'Iniciar execução de workflow' },
    ],
  },
  {
    key: 'agendamentos',
    label: 'Agendamentos',
    acoes: [
      { key: 'ver',     label: 'Visualizar agendamentos' },
      { key: 'criar',   label: 'Criar agendamentos' },
      { key: 'editar',  label: 'Editar agendamentos' },
      { key: 'deletar', label: 'Excluir agendamentos' },
    ],
  },
  {
    key: 'turnos',
    label: 'Turnos',
    acoes: [
      { key: 'ver',     label: 'Visualizar turnos' },
      { key: 'criar',   label: 'Criar turnos' },
      { key: 'editar',  label: 'Editar turnos' },
      { key: 'excluir', label: 'Excluir turnos' },
    ],
  },
  {
    key: 'catalogos',
    label: 'Catálogos',
    acoes: [
      { key: 'ver',     label: 'Visualizar catálogos' },
      { key: 'criar',   label: 'Criar catálogos' },
      { key: 'editar',  label: 'Editar catálogos' },
      { key: 'excluir', label: 'Excluir catálogos' },
    ],
  },
  {
    key: 'documentos',
    label: 'Documentos',
    acoes: [
      { key: 'ver',     label: 'Visualizar documentos' },
      { key: 'criar',   label: 'Enviar documentos' },
      { key: 'excluir', label: 'Excluir documentos' },
    ],
  },
  {
    key: 'causa_raiz',
    label: 'Causa raiz',
    acoes: [
      { key: 'criar',   label: 'Criar causa raiz' },
      { key: 'editar',  label: 'Editar causa raiz' },
      { key: 'excluir', label: 'Excluir causa raiz' },
    ],
  },
  {
    key: 'nao_execucao',
    label: 'Motivos de não execução',
    acoes: [
      { key: 'criar',   label: 'Criar motivo' },
      { key: 'editar',  label: 'Editar motivo' },
      { key: 'excluir', label: 'Excluir motivo' },
    ],
  },
  {
    key: 'dashboards',
    label: 'Dashboards',
    acoes: [
      { key: 'ver',     label: 'Visualizar dashboards' },
      { key: 'criar',   label: 'Criar/editar dashboards' },
      { key: 'deletar', label: 'Excluir dashboards' },
    ],
  },
  {
    key: 'ticket',
    label: 'Tickets / Chamados',
    acoes: [
      { key: 'ver',              label: 'Visualizar tickets' },
      { key: 'criar',            label: 'Abrir novos tickets' },
      { key: 'tratar',           label: 'Assumir e tratar tickets' },
      { key: 'cancelar',         label: 'Cancelar / marcar improcedente' },
      { key: 'categorias_gerir', label: 'Gerenciar categorias de tickets' },
    ],
  },
  {
    key: 'padrao',
    label: 'Padrões e variáveis',
    acoes: [
      { key: 'criar',  label: 'Criar padrão' },
      { key: 'editar', label: 'Editar padrão' },
      { key: 'excluir',label: 'Excluir padrão' },
    ],
  },
  {
    key: 'usuarios',
    label: 'Usuários',
    acoes: [
      { key: 'criar',  label: 'Criar usuário' },
      { key: 'editar', label: 'Editar usuário' },
      { key: 'excluir',label: 'Excluir usuário' },
    ],
  },
  {
    key: 'perfis',
    label: 'Perfis',
    acoes: [
      { key: 'criar',  label: 'Criar perfil' },
      { key: 'editar', label: 'Editar perfil' },
      { key: 'excluir',label: 'Excluir perfil' },
    ],
  },
  // 'indicadores' e 'relatorios' REMOVIDOS (2026-06-30): eram checkboxes que
  // NÃO salvavam — não existem na tabela `permissoes` e não são enforçados em
  // lugar nenhum (o menu lateral é estático, não filtra por permissão; a página
  // de Relatórios nem existe). Mesmo motivo pelo qual planos_acao/configuracoes
  // saíram do construtor (20260622160000): permissão sem enforcement engana.
]

// Workflow desabilitado: não aparece no construtor de perfis
export const recursos: Recurso[] = recursosTodos.filter(
  r => WORKFLOWS_HABILITADO || r.key !== 'workflows'
)
