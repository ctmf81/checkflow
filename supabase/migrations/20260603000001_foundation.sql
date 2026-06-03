-- ============================================================
-- CheckFlow — Foundation Schema
-- Multi-tenant, event sourcing, typed response origin
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- TENANTS (empresas)
-- ============================================================
create table tenants (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- USERS (profiles vinculados ao Supabase Auth)
-- ============================================================
create type user_role as enum ('admin', 'manager', 'operator', 'viewer');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  role        user_role not null default 'operator',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- CHECKLISTS (templates configuráveis)
-- ============================================================
create table checklists (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  description text,
  version     integer not null default 1,
  is_active   boolean not null default true,
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- CHECKLIST ITEMS (perguntas/itens do checklist)
-- ============================================================
create type item_type as enum (
  'boolean',      -- sim/não
  'number',       -- valor numérico com intervalo
  'text',         -- texto livre
  'photo',        -- foto/evidência
  'signature',    -- assinatura
  'select'        -- opção de lista
);

create table checklist_items (
  id              uuid primary key default uuid_generate_v4(),
  checklist_id    uuid not null references checklists(id) on delete cascade,
  order_index     integer not null,
  label           text not null,
  type            item_type not null,
  required        boolean not null default true,
  config          jsonb not null default '{}', -- min, max, options, conditions etc.
  created_at      timestamptz not null default now()
);

-- ============================================================
-- EXECUTIONS (instâncias de checklist em execução)
-- ============================================================
create type execution_status as enum ('in_progress', 'completed', 'cancelled');

create table executions (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  checklist_id  uuid not null references checklists(id),
  started_by    uuid not null references profiles(id),
  status        execution_status not null default 'in_progress',
  started_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- ============================================================
-- RESPONSE EVENTS (event sourcing — imutável)
-- Decisão de fundação: cada resposta é um evento novo,
-- nunca sobrescreve. origin_type identifica humano, sensor ou IA.
-- ============================================================
create type response_origin as enum ('human', 'sensor', 'ai');

create table response_events (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  execution_id    uuid not null references executions(id) on delete cascade,
  item_id         uuid not null references checklist_items(id),
  origin_type     response_origin not null default 'human',
  origin_id       uuid,         -- profile_id, sensor_id ou ai_model_id
  value           jsonb not null,
  file_url        text,         -- foto ou assinatura
  recorded_at     timestamptz not null default now(),
  synced_at       timestamptz   -- null = registrado offline, preenchido ao sincronizar
);

-- ============================================================
-- INDEXES
-- ============================================================
create index on profiles(tenant_id);
create index on checklists(tenant_id);
create index on executions(tenant_id);
create index on executions(checklist_id);
create index on response_events(execution_id);
create index on response_events(tenant_id);
create index on response_events(item_id);

-- ============================================================
-- ROW LEVEL SECURITY (isolamento multi-tenant)
-- ============================================================
alter table tenants          enable row level security;
alter table profiles         enable row level security;
alter table checklists       enable row level security;
alter table checklist_items  enable row level security;
alter table executions       enable row level security;
alter table response_events  enable row level security;

-- Usuário só acessa dados do próprio tenant
create policy "tenant_isolation" on profiles
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

create policy "tenant_isolation" on checklists
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

create policy "tenant_isolation" on checklist_items
  using (checklist_id in (
    select id from checklists
    where tenant_id = (select tenant_id from profiles where id = auth.uid())
  ));

create policy "tenant_isolation" on executions
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

create policy "tenant_isolation" on response_events
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));
