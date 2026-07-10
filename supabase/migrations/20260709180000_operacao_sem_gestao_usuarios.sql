-- ============================================================
-- FIX do backfill 20260709160000 — Operação não gerencia usuários
-- ============================================================
-- A migration 20260709160000 concedeu 'usuarios/importar' e
-- 'usuarios/aprovar_precadastro' a TODO perfil de sistema (where is_system=true),
-- o que incluiu o perfil "Operação" (...003) por engano. Operação é o perfil de
-- sistema do ambiente de operação e NÃO deve ter permissão de gestão de usuários.
-- Remove qualquer permissão do recurso 'usuarios' desse perfil.
-- (Admin de sistema ...001 e Admin da empresa ...002 seguem com elas.)

delete from perfil_permissoes pp
using permissoes p
where pp.perfil_id = '00000000-0000-0000-0000-000000000003'
  and pp.permissao_id = p.id
  and p.recurso = 'usuarios';
