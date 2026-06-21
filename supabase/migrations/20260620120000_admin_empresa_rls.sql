-- ============================================================
-- ADMIN DA EMPRESA — mesmas funções do admin de sistema, porém
-- restritas à(s) empresa(s) onde o usuário tem o perfil
-- "Admin da empresa" (perfil_id = ...002).
--
-- Escopo (confirmado 2026-06-20):
--   PODE: gerenciar usuários/acessos e estrutura (unidades, grupos,
--         subgrupos, turnos) da PRÓPRIA empresa; atribuir outro
--         "Admin da empresa" (vários em paralelo).
--   NÃO PODE: gerenciar outras empresas, catálogo de planos/preços,
--         parceiros, provedores de IA, colunas financeiras, nem se
--         tornar/atribuir "Admin de sistema".
--
-- Técnica: políticas ADITIVAS (RLS combina permissivas com OR), sem
-- reescrever/remover as policies existentes — evita afrouxar regras
-- por engano. Idempotente (drop if exists antes de cada create).
-- ============================================================

-- ── Helpers ───────────────────────────────────────────────────
-- É admin da empresa informada?
create or replace function is_admin_empresa(p_empresa_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from usuario_empresa
    where usuario_id = auth.uid()
      and empresa_id = p_empresa_id
      and perfil_id = '00000000-0000-0000-0000-000000000002'
  )
$$;

-- É admin da empresa dona da unidade / grupo / subgrupo informado?
create or replace function is_admin_empresa_unidade(p_unidade_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select is_admin_empresa((select empresa_id from unidades where id = p_unidade_id))
$$;

create or replace function is_admin_empresa_grupo(p_grupo_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select is_admin_empresa_unidade((select unidade_id from grupos where id = p_grupo_id))
$$;

create or replace function is_admin_empresa_subgrupo(p_subgrupo_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select is_admin_empresa_grupo((select grupo_id from subgrupos where id = p_subgrupo_id))
$$;

grant execute on function is_admin_empresa(uuid)            to authenticated;
grant execute on function is_admin_empresa_unidade(uuid)    to authenticated;
grant execute on function is_admin_empresa_grupo(uuid)      to authenticated;
grant execute on function is_admin_empresa_subgrupo(uuid)   to authenticated;

-- ── Estrutura organizacional ──────────────────────────────────
drop policy if exists "unidades_admin_empresa" on unidades;
create policy "unidades_admin_empresa" on unidades for all
  using (is_admin_empresa(empresa_id))
  with check (is_admin_empresa(empresa_id));

drop policy if exists "grupos_admin_empresa" on grupos;
create policy "grupos_admin_empresa" on grupos for all
  using (is_admin_empresa_unidade(unidade_id))
  with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "subgrupos_admin_empresa" on subgrupos;
create policy "subgrupos_admin_empresa" on subgrupos for all
  using (is_admin_empresa_grupo(grupo_id))
  with check (is_admin_empresa_grupo(grupo_id));

drop policy if exists "turnos_admin_empresa" on turnos;
create policy "turnos_admin_empresa" on turnos for all
  using (is_admin_empresa(empresa_id))
  with check (is_admin_empresa(empresa_id));

-- ── Vínculos de usuário (gestão de acessos) ───────────────────
-- usuario_empresa: o admin pode vincular/alterar perfil de usuários
-- da SUA empresa — inclusive promover outro "Admin da empresa".
-- Guard: NUNCA pode atribuir "Admin de sistema" (...001).
drop policy if exists "usuario_empresa_admin_empresa" on usuario_empresa;
create policy "usuario_empresa_admin_empresa" on usuario_empresa for all
  using (is_admin_empresa(empresa_id))
  with check (
    is_admin_empresa(empresa_id)
    and perfil_id is distinct from '00000000-0000-0000-0000-000000000001'
  );

drop policy if exists "usuario_unidade_admin_empresa" on usuario_unidade;
create policy "usuario_unidade_admin_empresa" on usuario_unidade for all
  using (is_admin_empresa_unidade(unidade_id))
  with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "usuario_grupo_admin_empresa" on usuario_grupo;
create policy "usuario_grupo_admin_empresa" on usuario_grupo for all
  using (is_admin_empresa_grupo(grupo_id))
  with check (is_admin_empresa_grupo(grupo_id));

drop policy if exists "usuario_subgrupo_admin_empresa" on usuario_subgrupo;
create policy "usuario_subgrupo_admin_empresa" on usuario_subgrupo for all
  using (is_admin_empresa_subgrupo(subgrupo_id))
  with check (is_admin_empresa_subgrupo(subgrupo_id));
