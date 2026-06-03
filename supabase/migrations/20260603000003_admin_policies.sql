-- Remove policies anteriores e recria com suporte a admin de sistema via JWT
drop policy if exists "login_por_cpf" on usuarios;
drop policy if exists "perfil_proprio" on usuarios;
drop policy if exists "perfis_leitura" on perfis;
drop policy if exists "permissoes_leitura" on permissoes;
drop policy if exists "perfil_permissoes_leitura" on perfil_permissoes;
drop policy if exists "empresas_acesso" on empresas;
drop policy if exists "empresas_admin_sistema" on empresas;

-- Helper: verifica se o usuário logado é admin de sistema
create or replace function is_admin_sistema()
returns boolean language sql security definer as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin_sistema',
    false
  )
$$;

-- USUARIOS
create policy "usuarios_leitura_publica" on usuarios for select using (true);
create policy "usuarios_escrita_propria"  on usuarios for all   using (auth.uid() = id);
create policy "usuarios_admin"            on usuarios for all   using (is_admin_sistema());

-- PERFIS
create policy "perfis_leitura" on perfis for select using (true);
create policy "perfis_admin"   on perfis for all    using (is_admin_sistema());

-- PERMISSOES
create policy "permissoes_leitura" on permissoes for select using (true);
create policy "permissoes_admin"   on permissoes for all    using (is_admin_sistema());

-- PERFIL_PERMISSOES
create policy "perfil_permissoes_leitura" on perfil_permissoes for select using (true);
create policy "perfil_permissoes_admin"   on perfil_permissoes for all    using (is_admin_sistema());

-- EMPRESAS: admin vê tudo, outros veem só as suas
create policy "empresas_admin"  on empresas for all    using (is_admin_sistema());
create policy "empresas_membro" on empresas for select using (
  id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
);

-- UNIDADES
create policy "unidades_admin"  on unidades for all    using (is_admin_sistema());
create policy "unidades_membro" on unidades for select using (
  id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

-- GRUPOS
create policy "grupos_admin"  on grupos for all    using (is_admin_sistema());
create policy "grupos_membro" on grupos for select using (
  id in (select grupo_id from usuario_grupo where usuario_id = auth.uid())
);

-- SUBGRUPOS
create policy "subgrupos_admin"  on subgrupos for all    using (is_admin_sistema());
create policy "subgrupos_membro" on subgrupos for select using (
  id in (select subgrupo_id from usuario_subgrupo where usuario_id = auth.uid())
);

-- JUNCTION TABLES
create policy "usuario_empresa_admin"   on usuario_empresa   for all using (is_admin_sistema());
create policy "usuario_unidade_admin"   on usuario_unidade   for all using (is_admin_sistema());
create policy "usuario_grupo_admin"     on usuario_grupo     for all using (is_admin_sistema());
create policy "usuario_subgrupo_admin"  on usuario_subgrupo  for all using (is_admin_sistema());
create policy "sessao_propria"          on sessao_usuario     for all using (auth.uid() = usuario_id);
