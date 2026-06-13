-- ============================================================
-- EMPRESA_FINANCEIRO — isola dados financeiros/contratuais (admin-only)
-- ============================================================
-- As colunas financeiras viviam em `empresas`, cuja policy `empresas_membro`
-- dá SELECT da linha inteira a membros da empresa — expondo valor da
-- mensalidade e % do parceiro via API direta (RLS é por linha, não por coluna).
-- Movemos para uma tabela 1:1 com RLS admin-only, sem policy de membro.
--
-- Idempotente: pode ser rodada com segurança mais de uma vez. O INSERT só
-- ocorre se as colunas ainda existirem em `empresas` (1ª execução); numa
-- re-execução ele é pulado.

create table if not exists empresa_financeiro (
  empresa_id           uuid primary key references empresas(id) on delete cascade,
  parceiro_id          uuid references parceiros(id) on delete set null,
  parceiro_percentual  numeric(5,2) check (parceiro_percentual is null or (parceiro_percentual >= 0 and parceiro_percentual <= 100)),
  plano                text,
  valor_mensalidade    numeric(10,2),
  status_pagamento     text not null default 'pendente' check (status_pagamento in ('em_dia','pendente','inadimplente','cancelado')),
  pagamento_vencimento date,
  atualizado_em        timestamptz not null default now(),
  atualizado_por       uuid
);

create index if not exists idx_empresa_financeiro_parceiro on empresa_financeiro (parceiro_id) where parceiro_id is not null;

-- Migra os dados existentes só se as colunas ainda estão em `empresas`
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'empresas' and column_name = 'parceiro_id'
  ) then
    insert into empresa_financeiro (empresa_id, parceiro_id, parceiro_percentual, plano, valor_mensalidade, status_pagamento, pagamento_vencimento)
    select id, parceiro_id, parceiro_percentual, plano, valor_mensalidade,
           coalesce(status_pagamento, 'pendente'), pagamento_vencimento
    from empresas
    on conflict (empresa_id) do nothing;
  end if;
end $$;

alter table empresa_financeiro enable row level security;
drop policy if exists "empresa_financeiro_admin" on empresa_financeiro;
create policy "empresa_financeiro_admin" on empresa_financeiro for all
  using (is_admin_sistema()) with check (is_admin_sistema());

-- Remove as colunas sensíveis de `empresas` (não mais expostas a membros)
alter table empresas drop column if exists parceiro_id;
alter table empresas drop column if exists parceiro_percentual;
alter table empresas drop column if exists plano;
alter table empresas drop column if exists valor_mensalidade;
alter table empresas drop column if exists status_pagamento;
alter table empresas drop column if exists pagamento_vencimento;
