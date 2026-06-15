-- ============================================================
-- BILLING — Fase 1: catálogo de planos e pacotes adicionais
-- ============================================================
-- Tabelas-template (catálogo). A assinatura da empresa (Fase 2)
-- fará SNAPSHOT dos termos do plano no momento da contratação,
-- então editar o catálogo aqui NÃO altera quem já assinou.
--
-- Limites: NULL = ilimitado.
-- RLS admin-only (is_admin_sistema()), padrão de empresa_financeiro.

-- ─── Planos ─────────────────────────────────────────────────
create table if not exists planos (
  id                          uuid primary key default uuid_generate_v4(),
  nome                        text not null,
  descricao                   text,
  tipo                        text not null default 'pago' check (tipo in ('gratuito','trial','pago')),
  valor                       numeric(10,2) not null default 0,
  -- ciclo de cobrança (null em gratuito/trial)
  ciclo                       text check (ciclo is null or ciclo in ('mensal','anual')),
  -- duração do trial em dias (preenchido só quando tipo = 'trial')
  dias_trial                  int check (dias_trial is null or dias_trial > 0),
  -- limites (null = ilimitado)
  limite_execucoes_mes        int    check (limite_execucoes_mes    is null or limite_execucoes_mes    >= 0),
  limite_armazenamento_bytes  bigint check (limite_armazenamento_bytes is null or limite_armazenamento_bytes >= 0),
  limite_tokens_ia_mes        bigint check (limite_tokens_ia_mes     is null or limite_tokens_ia_mes     >= 0),
  ativo                       boolean not null default true,
  ordem                       int not null default 0,
  criado_em                   timestamptz not null default now(),
  atualizado_em               timestamptz not null default now(),
  atualizado_por              uuid
);

alter table planos enable row level security;
drop policy if exists "planos_admin" on planos;
create policy "planos_admin" on planos for all
  using (is_admin_sistema()) with check (is_admin_sistema());

-- ─── Pacotes adicionais ─────────────────────────────────────
-- execucoes / tokens_ia: consumo mensal (somam ao saldo do mês, rolam — Fase 2)
-- armazenamento: capacidade permanente (somam ao teto total, não rolam)
create table if not exists pacotes_adicionais (
  id            uuid primary key default uuid_generate_v4(),
  nome          text not null,
  descricao     text,
  tipo          text not null check (tipo in ('execucoes','tokens_ia','armazenamento')),
  quantidade    bigint not null check (quantidade > 0),
  valor         numeric(10,2) not null default 0,
  ativo         boolean not null default true,
  ordem         int not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

alter table pacotes_adicionais enable row level security;
drop policy if exists "pacotes_adicionais_admin" on pacotes_adicionais;
create policy "pacotes_adicionais_admin" on pacotes_adicionais for all
  using (is_admin_sistema()) with check (is_admin_sistema());
