-- ============================================================
-- CONSOLIDADO — migrations desta sessão
-- Execute este arquivo no Supabase SQL Editor se ainda não
-- rodou os arquivos 000009 a 000012 individualmente.
-- É idempotente (pode rodar múltiplas vezes sem erro).
-- ============================================================

-- ── 000009: Fix RLS tabelas filhas de planos_acao ─────────────────────────────

drop policy if exists "plano_ev_insert"     on plano_acao_evidencias;
create policy "plano_ev_insert" on plano_acao_evidencias
  for insert with check (
    is_admin_sistema()
    or plano_acao_id in (
      select pa.id from planos_acao pa
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo where usuario_id = auth.uid()
      )
    )
  );

drop policy if exists "plano_ev_leitura"    on plano_acao_evidencias;
create policy "plano_ev_leitura" on plano_acao_evidencias
  for select using (
    is_admin_sistema()
    or plano_acao_id in (
      select pa.id from planos_acao pa
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo where usuario_id = auth.uid()
      )
    )
  );

drop policy if exists "plano_mov_insert"    on plano_acao_movimentacoes;
create policy "plano_mov_insert" on plano_acao_movimentacoes
  for insert with check (
    is_admin_sistema()
    or plano_acao_id in (
      select pa.id from planos_acao pa
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo where usuario_id = auth.uid()
      )
    )
  );

drop policy if exists "plano_mov_leitura"   on plano_acao_movimentacoes;
create policy "plano_mov_leitura" on plano_acao_movimentacoes
  for select using (
    is_admin_sistema()
    or plano_acao_id in (
      select pa.id from planos_acao pa
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo where usuario_id = auth.uid()
      )
    )
  );

drop policy if exists "plano_mov_ev_insert" on plano_acao_movimentacao_evidencias;
create policy "plano_mov_ev_insert" on plano_acao_movimentacao_evidencias
  for insert with check (
    is_admin_sistema()
    or movimentacao_id in (
      select m.id from plano_acao_movimentacoes m
      join planos_acao pa on pa.id = m.plano_acao_id
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo where usuario_id = auth.uid()
      )
    )
  );

drop policy if exists "plano_mov_ev_leitura" on plano_acao_movimentacao_evidencias;
create policy "plano_mov_ev_leitura" on plano_acao_movimentacao_evidencias
  for select using (
    is_admin_sistema()
    or movimentacao_id in (
      select m.id from plano_acao_movimentacoes m
      join planos_acao pa on pa.id = m.plano_acao_id
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo where usuario_id = auth.uid()
      )
    )
  );

alter table planos_acao
  drop constraint if exists planos_acao_status_check;
alter table planos_acao
  add constraint planos_acao_status_check
  check (status in ('em_moderacao_n1','em_moderacao_n2','corrigido','nao_corrigido','reaberto'));

-- ── 000010: Executor pode ver planos da própria execução ─────────────────────

drop policy if exists "planos_acao_leitura" on planos_acao;
create policy "planos_acao_leitura" on planos_acao for select using (
  is_admin_sistema()
  or subgrupo_id in (
    select subgrupo_id from usuario_subgrupo where usuario_id = auth.uid()
  )
  or checklist_execucao_id in (
    select id from checklist_execucoes where executado_por = auth.uid()
  )
);

-- ── 000011: Identificador PA-ANOMES-XXXX ─────────────────────────────────────

alter table planos_acao add column if not exists numero_seq integer;

alter table planos_acao
  add column if not exists identificador text
  generated always as (
    'PA-' || to_char(created_at, 'YYYYMM') || '-' || lpad(numero_seq::text, 4, '0')
  ) stored;

create or replace function planos_acao_set_numero_seq()
returns trigger language plpgsql as $$
declare
  v_empresa_id uuid;
  v_anomes     text;
  v_next       integer;
begin
  select g.empresa_id into v_empresa_id
  from subgrupos s join grupos g on g.id = s.grupo_id
  where s.id = NEW.subgrupo_id;

  v_anomes := to_char(now(), 'YYYYMM');

  select coalesce(max(pa.numero_seq), 0) + 1 into v_next
  from planos_acao pa
  join subgrupos s on s.id = pa.subgrupo_id
  join grupos    g on g.id = s.grupo_id
  where g.empresa_id = v_empresa_id
    and to_char(pa.created_at, 'YYYYMM') = v_anomes
    and pa.numero_seq is not null;

  NEW.numero_seq := v_next;
  return NEW;
end;
$$;

drop trigger if exists trg_planos_acao_identificador on planos_acao;
create trigger trg_planos_acao_identificador
  before insert on planos_acao
  for each row execute function planos_acao_set_numero_seq();

-- Backfill planos existentes
do $$
declare
  rec          record;
  v_empresa_id uuid;
  v_anomes     text;
  v_next       integer;
begin
  for rec in
    select pa.id, pa.subgrupo_id, pa.created_at
    from planos_acao pa where pa.numero_seq is null
    order by pa.created_at asc
  loop
    select g.empresa_id into v_empresa_id
    from subgrupos s join grupos g on g.id = s.grupo_id
    where s.id = rec.subgrupo_id;

    v_anomes := to_char(rec.created_at, 'YYYYMM');

    select coalesce(max(pa2.numero_seq), 0) + 1 into v_next
    from planos_acao pa2
    join subgrupos s2 on s2.id = pa2.subgrupo_id
    join grupos    g2 on g2.id = s2.grupo_id
    where g2.empresa_id = v_empresa_id
      and to_char(pa2.created_at, 'YYYYMM') = v_anomes
      and pa2.numero_seq is not null;

    update planos_acao set numero_seq = v_next where id = rec.id;
  end loop;
end;
$$;

-- ── 000012: pdf_url em checklist_execucoes ────────────────────────────────────

alter table checklist_execucoes
  add column if not exists pdf_url text;
