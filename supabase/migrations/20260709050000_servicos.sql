-- ============================================================
-- SERVIÇOS (entitlements por plano) — Fase 1
-- ============================================================
-- Um "serviço" é um MÓDULO (mapeia a 1+ recursos de permissão) ou uma
-- CARACTERÍSTICA (ex.: IA). Um plano inclui N serviços; a empresa herda do
-- plano ativo → recursos habilitados. v1: gating na UI (construtor de perfil +
-- menu) + cotas/IA já enforçadas por billing_*. RLS-por-plano = fase 2.
--
-- ⚠️ Regra de segurança: gating de UI NÃO substitui a RLS por unidade/empresa
-- (isolamento de tenant continua). O risco do v1 é uso de módulo além do plano
-- via URL direta — não vazamento entre empresas.

create table servicos (
  id         uuid primary key default gen_random_uuid(),
  chave      text not null unique,            -- id estável (ex.: 'tickets', 'ia')
  nome       text not null,
  descricao  text,
  tipo       text not null default 'modulo' check (tipo in ('modulo', 'caracteristica')),
  recursos   text[] not null default '{}',    -- recursos de permissão liberados (módulo)
  flag       text,                            -- característica: ex.: 'ia'
  ordem      int  not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table plano_servicos (
  plano_id   uuid not null references planos(id) on delete cascade,
  servico_id uuid not null references servicos(id) on delete cascade,
  primary key (plano_id, servico_id)
);
create index on plano_servicos(plano_id);

-- ── RLS ──────────────────────────────────────────────────────
-- Leitura por autenticado (catálogo; necessário p/ gating e comparação);
-- escrita só admin de sistema.
alter table servicos       enable row level security;
alter table plano_servicos enable row level security;

create policy "servicos_leitura" on servicos for select to authenticated using (true);
create policy "servicos_admin"   on servicos for all    using (is_admin_sistema()) with check (is_admin_sistema());

create policy "plano_servicos_leitura" on plano_servicos for select to authenticated using (true);
create policy "plano_servicos_admin"   on plano_servicos for all    using (is_admin_sistema()) with check (is_admin_sistema());

-- ── Seed do catálogo padrão ──────────────────────────────────
insert into servicos (chave, nome, descricao, tipo, recursos, flag, ordem) values
  ('checklists',   'Checklists',            'Criação e execução de checklists de inspeção.',            'modulo', array['checklists'],            null, 10),
  ('estrutura',    'Grupos e Áreas',        'Organização por grupos/subgrupos e funções (N1/N2).',      'modulo', array['grupos','subgrupos'],  null, 20),
  ('agendamentos', 'Agendamentos',          'Agendamento recorrente de checklists/workflows.',          'modulo', array['agendamentos'],          null, 30),
  ('tarefas',      'Listas de Tarefas',     'Listas de tarefas pontuais distribuídas a equipes.',       'modulo', array['tarefas'],               null, 40),
  ('tickets',      'Tickets / Chamados',    'Abertura e tratamento de chamados por área.',              'modulo', array['ticket'],                null, 50),
  ('planos_acao',  'Planos de Ação',        'Moderação N1/N2 de não conformidades.',                    'modulo', array['causa_raiz'],            null, 60),
  ('dashboards',   'Dashboards de TV',      'Painéis públicos de monitoramento em tela/TV.',            'modulo', array['dashboards'],            null, 70),
  ('documentos',   'Documentos (POP/IT)',   'Base de POPs/ITs e documentos de apoio na operação.',      'modulo', array['documentos'],            null, 80),
  ('catalogos',    'Catálogos',             'Catálogos de itens para respostas padronizadas.',          'modulo', array['catalogos'],             null, 90),
  ('padroes',      'Padrões e Variáveis',   'Faixas de referência por combinação de variáveis.',        'modulo', array['padrao'],                null, 100),
  ('turnos',       'Turnos',                'Turnos e regras de acesso/notificação fora do horário.',   'modulo', array['turnos'],                null, 110),
  ('ia',           'Consulta Inteligente (IA)', 'Perguntas em linguagem natural sobre documentos.',     'caracteristica', array[]::text[],       'ia', 200)
on conflict (chave) do nothing;
