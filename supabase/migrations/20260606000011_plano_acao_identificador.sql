-- ============================================================
-- Identificador legível para planos de ação
-- Formato: PA-AAAAMM-XXXX  (ex: PA-202606-0042)
-- Sequencial por empresa + ano-mês, com zero-fill de 4 dígitos
-- ============================================================

-- 1. Coluna que armazena o número sequencial
alter table planos_acao
  add column if not exists numero_seq integer;

-- 2. Coluna gerada (computed) com o identificador formatado
alter table planos_acao
  add column if not exists identificador text
  generated always as (
    'PA-' ||
    to_char(created_at, 'YYYYMM') || '-' ||
    lpad(numero_seq::text, 4, '0')
  ) stored;

-- 3. Função que calcula o próximo número sequencial por empresa + ano-mês
create or replace function planos_acao_set_numero_seq()
returns trigger language plpgsql as $$
declare
  v_empresa_id uuid;
  v_anomes     text;
  v_next       integer;
begin
  -- Descobre a empresa via subgrupo → grupo → empresa
  select g.empresa_id into v_empresa_id
  from subgrupos s
  join grupos g on g.id = s.grupo_id
  where s.id = NEW.subgrupo_id;

  -- Ano-mês do momento da inserção (ex: '202606')
  v_anomes := to_char(now(), 'YYYYMM');

  -- Próximo número na sequência desta empresa neste mês
  select coalesce(max(pa.numero_seq), 0) + 1 into v_next
  from planos_acao pa
  join subgrupos s  on s.id  = pa.subgrupo_id
  join grupos    g  on g.id  = s.grupo_id
  where g.empresa_id = v_empresa_id
    and to_char(pa.created_at, 'YYYYMM') = v_anomes
    and pa.numero_seq is not null;

  NEW.numero_seq := v_next;
  return NEW;
end;
$$;

-- 4. Trigger: executa antes de cada INSERT
drop trigger if exists trg_planos_acao_identificador on planos_acao;
create trigger trg_planos_acao_identificador
  before insert on planos_acao
  for each row execute function planos_acao_set_numero_seq();

-- 5. Backfill: preenche planos existentes (em ordem de criação)
do $$
declare
  rec record;
  v_empresa_id uuid;
  v_anomes     text;
  v_next       integer;
begin
  for rec in
    select pa.id, pa.subgrupo_id, pa.created_at
    from planos_acao pa
    where pa.numero_seq is null
    order by pa.created_at asc
  loop
    select g.empresa_id into v_empresa_id
    from subgrupos s
    join grupos g on g.id = s.grupo_id
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
