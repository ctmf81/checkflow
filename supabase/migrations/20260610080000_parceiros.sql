-- ============================================================
-- PARCEIROS — programa de indicação
-- ============================================================
-- Toda empresa pode ter um parceiro (indicador) que recebe um percentual
-- da mensalidade enquanto o contrato estiver ativo. Um parceiro pode estar
-- vinculado a várias empresas (1 parceiro : N empresas, 1 empresa : 1 parceiro).
--
-- Fluxos cobertos por esta migration (schema apenas — envio de email fica
-- em apps/api):
--   1. Cadastro do parceiro → email de boas-vindas (1x, controlado por
--      `email_boasvindas_enviado_em` + `parceiro_emails_log`)
--   2. Resumo mensal (último dia do mês) → empresas vinculadas, plano/valor
--      e estimativa de comissão do mês
--   3. Aviso de empresas que ficaram inativas no período → `empresa_status_eventos`
--
-- A parte financeira (pagamentos reais, conciliação) fica para uma fase futura;
-- por ora `valor_mensalidade` × `parceiro_percentual` é uma ESTIMATIVA.

create table if not exists parceiros (
  id            uuid primary key default uuid_generate_v4(),
  nome          text not null,
  email         text not null,
  telefone      text,
  documento     text, -- CPF ou CNPJ
  status        status_geral not null default 'ativo',
  email_boasvindas_enviado_em timestamptz,
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now()
);

create unique index if not exists idx_parceiros_email on parceiros (lower(email));

create or replace function parceiros_set_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end;
$$;
drop trigger if exists trg_parceiros_atualizado on parceiros;
create trigger trg_parceiros_atualizado
  before update on parceiros
  for each row execute function parceiros_set_atualizado_em();

-- ─── Vínculo empresa ↔ parceiro ─────────────────────────────────────────────
alter table empresas add column if not exists parceiro_id uuid references parceiros(id) on delete set null;
alter table empresas add column if not exists parceiro_percentual numeric(5,2)
  check (parceiro_percentual is null or (parceiro_percentual >= 0 and parceiro_percentual <= 100));

comment on column empresas.parceiro_percentual is
  'Percentual (0-100) da mensalidade repassado ao parceiro enquanto o contrato (status=ativo) estiver vigente.';

-- ─── Dados de plano/pagamento da empresa ────────────────────────────────────
-- Necessário para calcular a comissão (percentual × valor_mensalidade) e para
-- a aba "Pagamento" em /sistema/empresas/[id] (antes era só rascunho visual).
alter table empresas add column if not exists plano text;
alter table empresas add column if not exists valor_mensalidade numeric(10,2);
alter table empresas add column if not exists status_pagamento text not null default 'pendente'
  check (status_pagamento in ('em_dia','pendente','inadimplente','cancelado'));
alter table empresas add column if not exists pagamento_vencimento date;

-- ─── Histórico de status da empresa ─────────────────────────────────────────
-- Usado para informar o parceiro, no resumo mensal, se alguma empresa dele
-- ficou inativa durante o período.
create table if not exists empresa_status_eventos (
  id              uuid primary key default uuid_generate_v4(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  status_anterior status_empresa,
  status_novo     status_empresa not null,
  criado_em       timestamptz not null default now()
);
create index if not exists idx_empresa_status_eventos_empresa on empresa_status_eventos (empresa_id, criado_em desc);

create or replace function empresas_log_status_change()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into empresa_status_eventos (empresa_id, status_anterior, status_novo)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_empresas_status_change on empresas;
create trigger trg_empresas_status_change
  after update on empresas
  for each row execute function empresas_log_status_change();

-- ─── Log de emails enviados a parceiros (idempotência) ──────────────────────
create table if not exists parceiro_emails_log (
  id          uuid primary key default uuid_generate_v4(),
  parceiro_id uuid not null references parceiros(id) on delete cascade,
  tipo        text not null check (tipo in ('boas_vindas','resumo_mensal')),
  referencia  text, -- ex: '2026-06' para o resumo mensal de junho/2026
  enviado_em  timestamptz not null default now(),
  unique (parceiro_id, tipo, referencia)
);

-- ─── RLS — restrito a admin de sistema (dados financeiros sensíveis) ────────
alter table parceiros enable row level security;
drop policy if exists "parceiros_admin" on parceiros;
create policy "parceiros_admin" on parceiros for all
  using (is_admin_sistema()) with check (is_admin_sistema());

alter table empresa_status_eventos enable row level security;
drop policy if exists "empresa_status_eventos_admin" on empresa_status_eventos;
create policy "empresa_status_eventos_admin" on empresa_status_eventos for all
  using (is_admin_sistema()) with check (is_admin_sistema());

alter table parceiro_emails_log enable row level security;
drop policy if exists "parceiro_emails_log_admin" on parceiro_emails_log;
create policy "parceiro_emails_log_admin" on parceiro_emails_log for all
  using (is_admin_sistema()) with check (is_admin_sistema());
