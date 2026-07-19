-- Escalada de privilégio: is_admin_sistema() confiava em `user_metadata`.
--
-- `user_metadata` (raw_user_meta_data) é GRAVÁVEL pelo próprio usuário via
-- `supabase.auth.updateUser({ data: { role: 'admin_sistema' } })`, usando a
-- chave publishable que já está no browser. A chamada vai para o GoTrue, não
-- para o PostgREST, então nenhuma policy intercepta — e o JWT seguinte já sai
-- com o claim novo.
--
-- Como is_admin_sistema() é o `or` de abertura de praticamente toda policy do
-- projeto, qualquer usuário autenticado de qualquer empresa poderia virar
-- super-admin de plataforma e ler/escrever todos os tenants.
--
-- `app_metadata` (raw_app_meta_data) só é gravável com service role — é o
-- campo que o Supabase documenta para autorização.
--
-- Diagnóstico em 2026-07-18: uma única conta com o role (a seed de 2026-06-03),
-- sem nenhuma auto-promoção. Hardening preventivo, não incidente.
--
-- ⚠️ ORDEM IMPORTA: o backfill vem ANTES da troca da função. Invertido, todo
-- admin de plataforma perde o acesso na hora.
--
-- ⚠️ Sessões de admin já abertas seguem com o token antigo até o refresh
-- (~1h) e ficam sem acesso nesse intervalo — logout/login resolve.

-- 1. Backfill: espelha o role de user_metadata para app_metadata.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('role', 'admin_sistema')
where raw_user_meta_data ->> 'role' = 'admin_sistema'
  and coalesce(raw_app_meta_data ->> 'role', '') <> 'admin_sistema';

-- 2. Função passa a ler app_metadata.
create or replace function is_admin_sistema()
returns boolean language sql security definer as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_sistema',
    false
  )
$$;

-- Nota: user_metadata.role é deixado como está de propósito — remover agora
-- quebraria as telas que ainda leem `user.user_metadata?.role` até o patch dos
-- call sites subir. Limpar num passo posterior, depois do deploy do front.
