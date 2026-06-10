-- Configuração de onboarding por tela: ativar/desativar e sobrescrever conteúdo
-- via painel "/sistema/onboarding", sem precisar alterar código.

create table if not exists onboarding_paginas (
  page_id      text primary key,
  titulo       text not null,
  ativo        boolean not null default true,
  cards_override jsonb,
  updated_at   timestamptz not null default now()
);

alter table onboarding_paginas enable row level security;

-- Qualquer usuário autenticado pode ler (necessário para renderizar o onboarding)
drop policy if exists "onboarding_paginas_select" on onboarding_paginas;
create policy "onboarding_paginas_select" on onboarding_paginas
  for select using (auth.role() = 'authenticated');

-- Apenas admin de sistema pode ativar/desativar ou editar conteúdo
drop policy if exists "onboarding_paginas_admin" on onboarding_paginas;
create policy "onboarding_paginas_admin" on onboarding_paginas
  for all using (is_admin_sistema()) with check (is_admin_sistema());

-- Seed: uma linha por tela com onboarding contextual.
-- cards_override fica null até o admin editar pelo painel — nesse caso o
-- frontend usa o conteúdo padrão definido em components/onboarding/registry.ts
insert into onboarding_paginas (page_id, titulo, ativo) values
  ('gestao-home',        'Painel de Gestão',          true),
  ('acessos-empresa',    'Dados da Empresa',          true),
  ('acessos-turnos',     'Turnos',                    true),
  ('acessos-usuarios',   'Usuários',                  true),
  ('agendamentos',       'Agendamentos',              true),
  ('checklists',         'Checklists',                true),
  ('checklists-novo',    'Criar Checklist',           true),
  ('config-catalogos',   'Catálogos',                 true),
  ('config-causa-raiz',  'Causas Raiz',               true),
  ('config-documentos',  'Documentos',                true),
  ('config-formatacao',  'Formatação',                true),
  ('config-nao-execucao','Motivos de Não Execução',   true),
  ('config-notificacoes','Notificações',              true),
  ('grupos',             'Grupos e Subgrupos',        true),
  ('indicadores',        'Indicadores',               true),
  ('padrao-criar',       'Criar Padrão',              true),
  ('padrao-padroes',     'Padrões',                   true),
  ('padrao-variaveis',   'Variáveis de Padrão',       true),
  ('planos-acao',        'Planos de Ação',            true),
  ('tickets',            'Tickets / Chamados',        true),
  ('tickets-categorias', 'Categorias de Ticket',      true),
  ('tickets-sla',        'SLA de Tickets',            true),
  ('workflows',          'Workflows',                 true),
  ('workflows-novo',     'Criar Workflow',            true),
  ('operacao',           'Operação',                  true),
  ('perfis',             'Perfis de Acesso',          true),
  ('sistema-empresas',   'Painel de Sistema',         true),
  ('sistema-whatsapp',   'WhatsApp (sistema)',        true),
  ('sistema-termos',     'Termos de Uso',             true),
  ('sistema-onboarding', 'Configuração de Onboarding',true)
on conflict (page_id) do nothing;
