-- HOTFIX login prod (2026-08-21):
-- Migration 20260820150000 revogou EXECUTE de anon em buscar_email_por_cpf
-- pra fechar timing side-channel de enumeração de CPF. Mas o login por CPF
-- ([apps/web/app/(auth)/login/page.tsx](login/page.tsx)) chama essa RPC
-- ANTES do signInWithPassword — o usuário ainda é `anon` nesse ponto.
-- Resultado: login quebrou em prod.
--
-- Rollback: devolve GRANT EXECUTE a anon. O CPF não é secreto
-- (aparece em cadastro, boletos, contratos); mitigação de enumeração/timing
-- fica pra rate-limit por IP (backlog do próprio PR #172), não fechando
-- a função que o login precisa.

do $$
begin
  if exists (select 1 from pg_proc where proname = 'buscar_email_por_cpf') then
    grant execute on function public.buscar_email_por_cpf(text) to anon;
  end if;
end $$;
