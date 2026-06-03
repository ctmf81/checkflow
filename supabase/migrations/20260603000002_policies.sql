-- ============================================================
-- Policies de acesso
-- ============================================================

-- Permite buscar email pelo CPF (necessário para login por CPF)
create policy "login_por_cpf" on usuarios
  for select
  using (true);

-- Usuário autenticado acessa seu próprio perfil
create policy "perfil_proprio" on usuarios
  for all
  using (auth.uid() = id);

-- Perfis são públicos para leitura (necessário para listagens)
create policy "perfis_leitura" on perfis
  for select
  using (true);

-- Permissões são públicas para leitura
create policy "permissoes_leitura" on permissoes
  for select
  using (true);

-- Perfil_permissoes leitura
create policy "perfil_permissoes_leitura" on perfil_permissoes
  for select
  using (true);

-- Empresas: usuário vê empresas às quais pertence
create policy "empresas_acesso" on empresas
  for select
  using (
    id in (
      select empresa_id from usuario_empresa where usuario_id = auth.uid()
    )
    or
    exists (
      select 1 from usuarios u
      join usuario_empresa ue on ue.usuario_id = u.id
      join perfis p on p.id = ue.perfil_id
      where u.id = auth.uid() and p.empresa_id is null -- admin de sistema
    )
  );

-- Admin de sistema pode fazer tudo em empresas
create policy "empresas_admin_sistema" on empresas
  for all
  using (
    exists (
      select 1 from usuario_empresa ue
      join perfis p on p.id = ue.perfil_id
      where ue.usuario_id = auth.uid() and p.empresa_id is null
    )
  );
