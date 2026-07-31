-- ============================================================
-- FIX: planos_acao_set_numero_seq usa g.empresa_id (coluna inexistente)
-- ============================================================
-- A migration 20260606000013 redefiniu a função do trigger de numeração dos
-- planos de ação referenciando `g.empresa_id`, mas `grupos` NÃO tem essa coluna
-- (a cadeia é grupos → unidades → empresas). Em produção a função foi corrigida
-- à mão; no ambiente de DEV (montado só das migrations) o trigger quebra e
-- TODO insert em planos_acao falha com "column g.empresa_id does not exist".
--
-- Esta migration restaura a cadeia correta (grupos → unidades → empresas) e
-- volta a preencher `identificador` (formato PA-AAAAMM-XXXX), que a 000013 havia
-- deixado de setar. Idempotente (create or replace).

create or replace function planos_acao_set_numero_seq()
returns trigger language plpgsql as $$
declare
  v_empresa_id uuid;
  v_anomes     text;
  v_next       integer;
begin
  select u.empresa_id into v_empresa_id
  from subgrupos s
  join grupos   g on g.id = s.grupo_id
  join unidades u on u.id = g.unidade_id
  where s.id = NEW.subgrupo_id;

  v_anomes := to_char(now(), 'YYYYMM');

  select coalesce(max(pa.numero_seq), 0) + 1 into v_next
  from planos_acao pa
  join subgrupos s on s.id = pa.subgrupo_id
  join grupos    g on g.id = s.grupo_id
  join unidades  u on u.id = g.unidade_id
  where u.empresa_id = v_empresa_id
    and to_char(pa.created_at, 'YYYYMM') = v_anomes
    and pa.numero_seq is not null;

  NEW.numero_seq    := v_next;
  NEW.identificador := 'PA-' || v_anomes || '-' || lpad(v_next::text, 4, '0');
  return NEW;
end;
$$;
