export interface Acao {
  key: string
  label: string
}

export interface Recurso {
  key: string
  label: string
  acoes: Acao[]
}

export const recursos: Recurso[] = [
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
      { key: 'criar',  label: 'Criar grupo' },
      { key: 'editar', label: 'Editar grupo' },
      { key: 'excluir',label: 'Excluir grupo' },
    ],
  },
  {
    key: 'subgrupos',
    label: 'Áreas',
    acoes: [
      { key: 'criar',  label: 'Criar área' },
      { key: 'editar', label: 'Editar área' },
      { key: 'excluir',label: 'Excluir área' },
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
  {
    key: 'indicadores',
    label: 'Indicadores',
    acoes: [
      { key: 'ver',    label: 'Visualizar indicadores' },
      { key: 'editar', label: 'Editar indicadores' },
    ],
  },
  {
    key: 'relatorios',
    label: 'Relatórios',
    acoes: [
      { key: 'ver',      label: 'Visualizar relatórios' },
      { key: 'exportar', label: 'Exportar relatórios' },
    ],
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    acoes: [
      { key: 'ver',    label: 'Visualizar configurações' },
      { key: 'editar', label: 'Editar configurações' },
    ],
  },
]
