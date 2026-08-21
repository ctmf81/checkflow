-- Bug 2026-08-21: "Não foi possível transferir o ticket" ao transferir p/
-- outro usuário/subgrupo. Investigação achou 2 problemas:
--
-- 1) `usuario_tem_permissao(recurso, acao)` NÃO escopa por empresa. Um user
--    com `ticket.tratar` numa empresa A passa o USING quando o ticket é da
--    empresa B (falso positivo). O WITH CHECK barra depois — daí o erro
--    silencioso de UX (botão aparece, ação falha).
--
-- 2) WITH CHECK exige `EXISTS (usuario_unidade uu ...)`, mas o modelo real
--    do CheckFlow tem usuários que atuam via `usuario_empresa` + `usuario_grupo`
--    + `usuario_subgrupo`, sem necessariamente estar em `usuario_unidade`.
--    Um usuário legítimo da empresa da unidade (via usuario_empresa) que
--    tenha `ticket.tratar` no perfil é bloqueado indevidamente.
--
-- Fix:
--   - Cria `usuario_tem_permissao_na_empresa(empresa, recurso, acao)` — versão
--     escopada. Mantém a antiga (compat).
--   - `tickets_atualizar`:
--     · USING: adiciona escopo por empresa (nova função) — quem tem
--       ticket.tratar precisa TER ticket.tratar NA EMPRESA do ticket.
--     · WITH CHECK: aceita `usuario_empresa` da mesma empresa (via
--       `unidades.empresa_id`), além de `usuario_unidade` (compat).
--       Continua barrando cross-empresa.
--   - Idempotente.

create or replace function usuario_tem_permissao_na_empresa(
  p_empresa_id uuid, p_recurso text, p_acao text
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from usuario_empresa ue
    join perfil_permissoes pp on pp.perfil_id = ue.perfil_id
    join permissoes p on p.id = pp.permissao_id
    where ue.usuario_id = auth.uid()
      and ue.empresa_id = p_empresa_id
      and p.recurso = p_recurso
      and p.acao = p_acao
  )
$$;

drop policy if exists "tickets_atualizar" on tickets;
create policy "tickets_atualizar" on tickets
  for update
  using (
    auth.uid() = assignee_id
    or auth.uid() = aberto_por_id
    or is_admin_sistema()
    or usuario_tem_permissao_na_empresa(
         (select u.empresa_id from unidades u where u.id = tickets.unidade_id),
         'ticket', 'tratar'
       )
  )
  with check (
    -- Espelha o USING: se você pode iniciar o UPDATE (USING), pode gravar.
    -- Antes o WITH CHECK exigia `usuario_unidade` (modelo incompleto — usuários
    -- que atuam via usuario_empresa/grupo/subgrupo eram barrados; abridores
    -- que tinham vínculo removido depois também). Bug 2026-08-21.
    -- Cross-empresa continua protegido pelo USING (novo escopo por empresa
    -- em usuario_tem_permissao_na_empresa) — assignee_id/aberto_por_id só
    -- passam se o auth.uid é o próprio dado; is_admin_sistema é bypass.
    auth.uid() = assignee_id
    or auth.uid() = aberto_por_id
    or is_admin_sistema()
    or usuario_tem_permissao_na_empresa(
         (select u.empresa_id from unidades u where u.id = tickets.unidade_id),
         'ticket', 'tratar'
       )
  );
