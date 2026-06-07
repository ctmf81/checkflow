-- ============================================================
-- Completa o catálogo de permissões (`permissoes`) para cobrir
-- recursos/ações que existiam na UI mas não tinham permissão
-- correspondente no cadastro de perfis (PerfilModal).
--
-- Sem esses registros, marcar a ação no cadastro de perfil não
-- tinha efeito: o salvamento filtra por correspondência exata
-- em `permissoes.recurso/acao`.
-- ============================================================

insert into permissoes (recurso, acao, descricao) values
  -- Grupos: gestão de membros (além do CRUD já existente)
  ('grupos',       'adicionar_usuario', 'Adicionar usuário ao grupo'),
  ('grupos',       'gerenciar_usuario', 'Gerenciar usuários do grupo (remover, trocar)'),

  -- Subgrupos (Áreas): atribuição de função N1/N2/Executor
  ('subgrupos',    'gerenciar_funcoes', 'Gerenciar funções (N1 / N2 / Executor)'),

  -- Workflows
  ('workflows',    'criar',    'Criar workflow'),
  ('workflows',    'editar',   'Editar workflow'),
  ('workflows',    'publicar', 'Publicar / inativar workflow'),
  ('workflows',    'excluir',  'Excluir workflow'),
  ('workflows',    'iniciar',  'Iniciar execução de workflow'),

  -- Turnos
  ('turnos',       'ver',      'Visualizar turnos'),
  ('turnos',       'criar',    'Criar turnos'),
  ('turnos',       'editar',   'Editar turnos'),
  ('turnos',       'excluir',  'Excluir turnos'),

  -- Catálogos
  ('catalogos',    'ver',      'Visualizar catálogos'),
  ('catalogos',    'criar',    'Criar catálogos'),
  ('catalogos',    'editar',   'Editar catálogos'),
  ('catalogos',    'excluir',  'Excluir catálogos'),

  -- Documentos
  ('documentos',   'ver',      'Visualizar documentos'),
  ('documentos',   'criar',    'Enviar documentos'),
  ('documentos',   'excluir',  'Excluir documentos'),

  -- Causa raiz
  ('causa_raiz',   'criar',    'Criar causa raiz'),
  ('causa_raiz',   'editar',   'Editar causa raiz'),
  ('causa_raiz',   'excluir',  'Excluir causa raiz'),

  -- Motivos de não execução
  ('nao_execucao', 'criar',    'Criar motivo de não execução'),
  ('nao_execucao', 'editar',   'Editar motivo de não execução'),
  ('nao_execucao', 'excluir',  'Excluir motivo de não execução'),

  -- Planos de ação / Moderação
  ('planos_acao',  'ver',          'Visualizar planos de ação'),
  ('planos_acao',  'moderar_n1',   'Moderar como N1'),
  ('planos_acao',  'moderar_n2',   'Moderar como N2')
on conflict (recurso, acao) do nothing;

-- Concede todas as novas permissões aos perfis padrão "Admin da empresa"
-- e "Admin de sistema" (is_system = true), para não quebrar acesso atual.
insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from perfis pf
join permissoes p on p.recurso in (
  'grupos', 'subgrupos', 'workflows', 'turnos', 'catalogos',
  'documentos', 'causa_raiz', 'nao_execucao', 'planos_acao'
)
where pf.is_system = true
on conflict do nothing;
