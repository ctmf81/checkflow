-- Auditoria 2026-08-20 (Auth + Migrations):
--   1) `buscar_email_por_cpf` ainda tinha GRANT EXECUTE TO anon (migration
--      20260606000005). Anon podia enumerar CPFs (timing side-channel).
--      Fix: REVOKE anon, mantém authenticated.
--   2) Triggers de tickets e notif_templates faltavam `drop if exists` no
--      arquivo original — reaplicação (dev fresh, restore, blue-green) falhava
--      com "trigger already exists". Fix: drop+create desses 6 triggers agora
--      idempotente. Idempotente sozinho.

-- ── 1) Revoke anon do buscar_email_por_cpf ────────────────────────────────
-- ACL da função tinha "=X/postgres" (PUBLIC), que inclui anon. REVOKE anon
-- sozinho não basta — precisa REVOKE PUBLIC + GRANT explícito só a authenticated.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'buscar_email_por_cpf') then
    revoke execute on function public.buscar_email_por_cpf(text) from public;
    revoke execute on function public.buscar_email_por_cpf(text) from anon;
    grant  execute on function public.buscar_email_por_cpf(text) to authenticated;
  end if;
end $$;

-- ── 2) Triggers idempotentes (tickets + notif templates) ──────────────────
-- tickets (originais em 20260609000001_tickets.sql sem drop):
drop trigger if exists trg_tickets_numero on tickets;
create trigger trg_tickets_numero
  before insert on tickets
  for each row execute function tickets_set_numero();

drop trigger if exists trg_tickets_sla on tickets;
create trigger trg_tickets_sla
  before insert on tickets
  for each row execute function tickets_set_sla();

drop trigger if exists trg_tickets_updated_at on tickets;
create trigger trg_tickets_updated_at
  before update on tickets
  for each row execute function tickets_set_atualizado_em();

drop trigger if exists trg_tickets_sla_pausa on tickets;
create trigger trg_tickets_sla_pausa
  before update on tickets
  for each row execute function tickets_gerenciar_sla_pausa();

-- notif templates (originais em 20260609010000_notificacao_templates.sql):
drop trigger if exists trg_notif_templates_updated on notificacao_templates;
create trigger trg_notif_templates_updated
  before update on notificacao_templates
  for each row execute function notif_templates_set_atualizado_em();

drop trigger if exists trg_empresa_notif_seed on empresas;
create trigger trg_empresa_notif_seed
  after insert on empresas
  for each row execute function trg_seed_notif_empresa();
